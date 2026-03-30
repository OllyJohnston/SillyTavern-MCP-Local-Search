import axios from 'axios';
import * as cheerio from 'cheerio';
import { SearchOptions, SearchResult, SearchResultWithMetadata, ServerConfig } from './types.js';
import { generateTimestamp, sanitizeQuery } from './utils.js';
import { RateLimiter } from './rate-limiter.js';
import { BrowserPool } from './browser-pool.js';

export class SearchEngine {
  private readonly rateLimiter: RateLimiter;
  private browserPool: BrowserPool;
  private config: ServerConfig;

  constructor(config: ServerConfig, browserPool: BrowserPool) {
    this.config = config;
    this.rateLimiter = new RateLimiter(10); // 10 requests per minute
    this.browserPool = browserPool;
  }

  async search(options: SearchOptions): Promise<SearchResultWithMetadata> {
    const { query, numResults = 5, timeout = 10000 } = options;
    const sanitizedQuery = sanitizeQuery(query);

    console.log(`[SearchEngine] Starting search for query: "${sanitizedQuery}"`);

    try {
      return await this.rateLimiter.execute(async () => {
        console.log(`[SearchEngine] Starting search with multiple engines...`);

        // Configuration from options with fallbacks to environment config
        const enableQualityCheck = this.config.enableRelevanceChecking;
        const qualityThreshold = this.config.relevanceThreshold;
        // Use per-request override if available, otherwise use global config
        const forceMultiEngine = options.forceMultiEngine !== undefined ? options.forceMultiEngine : this.config.forceMultiEngineSearch;
        const debugBrowsers = this.config.debugBrowserLifecycle;

        console.log(`[SearchEngine] Search configuration:`, { 
          enableQualityCheck, 
          qualityThreshold, 
          forceMultiEngine, 
          preferredEngine: options.preferredEngine 
        });

        // Try multiple approaches to get search results, starting with preferred engine
        const allApproaches = [
          { method: this.tryBrowserBingSearch.bind(this), name: 'Browser Bing', id: 'bing' },
          { method: this.tryDuckDuckGoSearch.bind(this), name: 'Axios DuckDuckGo', id: 'duckduckgo' },
          { method: this.tryStartpageSearch.bind(this), name: 'Axios Startpage', id: 'startpage' }
        ];

        // Prioritize the preferred engine if provided (defaults to bing)
        const preferredId = options.preferredEngine || 'bing';
        console.log(`[SearchEngine] Prioritizing engine ID: "${preferredId}"`);

        const approaches = [
          ...allApproaches.filter(a => a.id === preferredId),
          ...allApproaches.filter(a => a.id !== preferredId)
        ];
        console.log(`[SearchEngine] Effective waterfall: ${approaches.map(a => a.name).join(' -> ')}`);

        let bestResults: SearchResult[] = [];
        let bestEngine = 'None';
        let bestQuality = 0;

        for (let i = 0; i < approaches.length; i++) {
          const approach = approaches[i];
          try {
            console.log(`[SearchEngine] [${i + 1}/${approaches.length}] Attempting ${approach.name}...`);

            // Use more aggressive timeouts for faster fallback
            const approachTimeout = Math.min(timeout / 3, 10000); 
            const results = await approach.method(sanitizedQuery, numResults, approachTimeout);
            
            if (results && results.length > 0) {
              console.log(`[SearchEngine] Found ${results.length} results with ${approach.name}`);

              const qualityScore = enableQualityCheck ? this.assessResultQuality(results, sanitizedQuery) : 1.0;
              console.log(`[SearchEngine] ${approach.name} quality score: ${qualityScore.toFixed(2)}/1.0`);

              if (qualityScore > bestQuality) {
                bestResults = results;
                bestEngine = approach.name;
                bestQuality = qualityScore;
              }

              // EXIT LOGIC:
              // 1. Ultra-high quality results (score >= 0.95) - return immediately regardless of multi-engine toggle
              if (qualityScore >= 0.95) {
                console.log(`[SearchEngine] Ultra-high quality results from ${approach.name} (100% relevance), returning immediately.`);
                return { results, engine: approach.name };
              }

              // 2. Excellent results (score >= 0.8) and NOT forcing multi-engine
              if (qualityScore >= 0.8 && !forceMultiEngine) {
                console.log(`[SearchEngine] Excellent results from ${approach.name}, returning immediately.`);
                return { results, engine: approach.name };
              }

              // 2. Acceptable results (score >= threshold) and NOT forcing multi-engine
              // Note: Removed the Bing-specific exclusion here to allow returning immediately from ANY first engine if preferred
              if (qualityScore >= qualityThreshold && !forceMultiEngine) {
                console.log(`[SearchEngine] Good results from ${approach.name}, returning immediately (forceMultiEngine is false).`);
                return { results, engine: approach.name };
              }

              // If this is the last engine, we MUST return whatever we have
              if (i === approaches.length - 1) {
                console.log(`[SearchEngine] Last engine reached, returning best results from ${bestEngine}`);
                return { results: bestResults, engine: bestEngine };
              } else {
                console.log(`[SearchEngine] Quality not sufficient or multi-engine forced, continuing waterfall...`);
              }
            }
          } catch (error) {
            console.error(`[SearchEngine] ${approach.name} approach failed:`, error);
            await this.handleBrowserError(error, approach.name);
          }
        }

        // If we finished the loop and have any results, return the best ones found
        if (bestResults.length > 0) {
          console.log(`[SearchEngine] Search finished, using best results found from ${bestEngine} (quality: ${bestQuality.toFixed(2)})`);
          return { results: bestResults, engine: bestEngine };
        }

        console.log(`[SearchEngine] All approaches failed to find results, returning empty`);
        return { results: [], engine: 'None' };
      });
    } catch (error) {
      console.error('[SearchEngine] Search error:', error);
      if (axios.isAxiosError(error)) {
        console.error('[SearchEngine] Axios error details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data?.substring(0, 500),
        });
      }
      throw new Error(`Failed to perform search: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async tryStartpageSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying Startpage (Axios) as high-quality fallback...`);
    try {
      const userAgent = getRandomUserAgent();
      const searchUrl = 'https://www.startpage.com/sp/search';
      const response = await axios.get(searchUrl, {
        params: {
          query: query,
          cat: 'web',
          sc: 'xkl08PIP6K7120',
          lui: 'english',
          language: 'english',
          t: 'device'
        },
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://www.startpage.com/',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout,
        validateStatus: (status: number) => status === 200,
      });

      console.log(`[SearchEngine] Startpage got response with status: ${response.status}`);
      const results = this.parseStartpageResults(response.data, numResults);
      console.log(`[SearchEngine] Startpage parsed ${results.length} results`);
      return results;
    } catch (error: any) {
      console.error(`[SearchEngine] Startpage search failed: ${error.message}`);
      return [];
    }
  }

  private parseStartpageResults(html: string, maxResults: number): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    $('.w-gl .result, .result').each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);
      const $titleLink = $element.find('a.result-title').first();
      
      if ($titleLink.length) {
        let title = $titleLink.find('.wgl-title').text().trim();
        if (!title) title = $titleLink.text().trim();
        
        const url = $titleLink.attr('href') || '';
        const snippet = $element.find('.description').text().trim();

        if (title && url && url.startsWith('http')) {
          results.push({
            title,
            url,
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success'
          });
        }
      }
    });

    return results;
  }

  private async tryBrowserBingSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    const debugBing = this.config.debugBingSearch;
    console.log(`[SearchEngine] BING: Starting browser-based search with shared browser for query: "${query}"`);
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        console.log(`[SearchEngine] BING: Attempt ${attempt}/2 - Getting browser from pool...`);
        const startTime = Date.now();
        browser = await this.browserPool.getBrowser();
        const launchTime = Date.now() - startTime;
        console.log(`[SearchEngine] BING: Browser acquired successfully in ${launchTime}ms, connected: ${browser.isConnected()}`);
        const results = await this.tryBrowserBingSearchInternal(browser, query, numResults, timeout);
        console.log(`[SearchEngine] BING: Search completed successfully with ${results.length} results`);
        return results;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[SearchEngine] BING: Attempt ${attempt}/2 FAILED with error: ${errorMessage}`);
        if (debugBing) console.error(`[SearchEngine] BING: Full error details:`, error);
        if (attempt === 2) {
          console.error(`[SearchEngine] BING: All attempts exhausted, giving up`);
          throw error;
        }
        console.log(`[SearchEngine] BING: Waiting 500ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new Error('All Bing search attempts failed');
  }

  private async tryBrowserBingSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    const debugBing = this.config.debugBingSearch;
    if (!browser.isConnected()) {
      console.error(`[SearchEngine] BING: Browser is not connected`);
      throw new Error('Browser is not connected');
    }
    console.log(`[SearchEngine] BING: Creating browser context with enhanced fingerprinting...`);
    let context;
    try {
      const { viewport, hasTouch, isMobile } = getRandomViewportAndDevice();
      context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport,
        hasTouch,
        isMobile,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'light',
        deviceScaleFactor: Math.random() > 0.5 ? 2 : 1, // Feature #3: Canvas/Hardware signature randomization
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none'
        }
      });
      console.log(`[SearchEngine] BING: Context created, opening new page...`);
      let page = await context.newPage();
      console.log(`[SearchEngine] BING: Page opened successfully`);

      // Try enhanced search first (homepage interaction)
      let results: SearchResult[] = [];
      try {
        console.log(`[SearchEngine] BING: Attempting enhanced search (homepage → form submission)...`);
        results = await this.tryEnhancedBingSearch(page, query, numResults, timeout);
        console.log(`[SearchEngine] BING: Enhanced search returned ${results.length} results`);
      } catch (enhancedError) {
        const errorMessage = enhancedError instanceof Error ? enhancedError.message : 'Unknown error';
        console.error(`[SearchEngine] BING: Enhanced search failed: ${errorMessage}`);
        if (debugBing) console.error(`[SearchEngine] BING: Enhanced search error details:`, enhancedError);
      }

      // Finding #1: Fallback to direct search if enhanced returned 0 results OR crashed
      if (results.length === 0) {
        console.log(`[SearchEngine] BING: Enhanced search empty or failed, closing page and trying direct URL search...`);
        await page.close().catch((e: any) => console.error(`[SearchEngine] BING: Error closing page:`, e));
        page = await context.newPage();

        results = await this.tryDirectBingSearch(page, query, numResults, timeout);
        console.log(`[SearchEngine] BING: Direct search returned ${results.length} results`);
      }

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[SearchEngine] BING: Internal search failed: ${errorMessage}`);
      if (debugBing) console.error(`[SearchEngine] BING: Internal search error details:`, error);
      throw error;
    } finally {
      if (context) {
        await context.close().catch((e: any) => console.error(`[SearchEngine] BING: Error closing context:`, e));
      }
    }
  }

  private async tryEnhancedBingSearch(page: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] BING: Enhanced search - navigating to Bing homepage...`);
    const startTime = Date.now();
    await page.goto('https://www.bing.com', { waitUntil: 'domcontentloaded', timeout: Math.max(timeout * 0.8, 5000) });
    const loadTime = Date.now() - startTime;
    console.log(`[SearchEngine] BING: Homepage loaded in ${loadTime}ms`);
    await this.dismissConsent(page);
    await page.waitForTimeout(500);
    try {
      console.log(`[SearchEngine] BING: Looking for search form elements...`);
      await page.waitForSelector('#sb_form_q', { timeout: 2000 });
      console.log(`[SearchEngine] BING: Search box found, filling with query: "${query}"`);
      await page.fill('#sb_form_q', query);
      
      // Feature #1: Human-mimicry jitter before search button click
      const jitter = Math.floor(Math.random() * 1500 + 500);
      console.log(`[SearchEngine] BING: Mimicking human thought, waiting ${jitter}ms before clicking search...`);
      await page.waitForTimeout(jitter);
      
      console.log(`[SearchEngine] BING: Clicking search button and waiting for navigation...`);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: timeout }),
        page.click('#search_icon')
      ]);
      const searchLoadTime = Date.now() - startTime;
      console.log(`[SearchEngine] BING: Search completed in ${searchLoadTime}ms total`);
    } catch (formError) {
      const errorMessage = formError instanceof Error ? formError.message : 'Unknown error';
      console.error(`[SearchEngine] BING: Search form submission failed: ${errorMessage}`);
      throw formError;
    }
    await this.dismissConsent(page);
    try {
      console.log(`[SearchEngine] BING: Waiting for search results to appear...`);
      await page.waitForSelector('.b_algo, .b_result', { timeout: 3000 });
      console.log(`[SearchEngine] BING: Search results selector found`);
    } catch {
      console.log(`[SearchEngine] BING: Search results selector not found, proceeding anyway`);
    }
    const html = await page.content();
    console.log(`[SearchEngine] BING: Got page HTML with length: ${html.length} characters`);
    const results = this.parseBingResults(html, numResults);
    if (results.length === 0) {
      const pageTitle = await page.title().catch(() => 'unknown');
      console.log(`[SearchEngine] BING Enhanced Debug: Page title is "${pageTitle}"`);
    }
    console.log(`[SearchEngine] BING: Enhanced search parsed ${results.length} results`);
    return results;
  }

  private async tryDirectBingSearch(page: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    const debugBing = this.config.debugBingSearch;
    console.log(`[SearchEngine] BING: Direct search with enhanced parameters...`);
    const cvid = this.generateConversationId();
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(numResults, 10)}&form=QBLH&sp=-1&qs=n&cvid=${cvid}`;
    console.log(`[SearchEngine] BING: Navigating to direct URL: ${searchUrl}`);
    const startTime = Date.now();
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: timeout });
    const loadTime = Date.now() - startTime;
    console.log(`[SearchEngine] BING: Direct page loaded in ${loadTime}ms`);
    await this.dismissConsent(page);
    try {
      console.log(`[SearchEngine] BING: Waiting for search results to appear...`);
      await page.waitForSelector('.b_algo, .b_result', { timeout: 3000 });
      console.log(`[SearchEngine] BING: Search results selector found`);
    } catch {
      console.log(`[SearchEngine] BING: Search results selector not found, proceeding anyway`);
    }
    const html = await page.content();
    console.log(`[SearchEngine] BING: Got page HTML with length: ${html.length} characters`);
    const results = this.parseBingResults(html, numResults);
    if (results.length === 0) {
      const pageTitle = await page.title().catch(() => 'unknown');
      console.log(`[SearchEngine] BING Direct Debug: Page title is "${pageTitle}"`);
    }
    console.log(`[SearchEngine] BING: Direct search parsed ${results.length} results`);
    return results;
  }

  private generateConversationId(): string {
    const chars = '0123456789ABCDEF';
    let cvid = '';
    for (let i = 0; i < 32; i++) {
      cvid += chars[Math.floor(Math.random() * chars.length)];
    }
    return cvid;
  }

  private async tryDuckDuckGoSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying DuckDuckGo (HTML Lite) as fallback...`);
    try {
      // Feature #2: Refined Axios headers to resolve 202 "Accepted" delays
      const userAgent = getRandomUserAgent();
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://duckduckgo.com/',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
        },
        timeout,
        validateStatus: (status: number) => status < 400,
      });
      console.log(`[SearchEngine] DuckDuckGo got response with status: ${response.status}`);
      const results = this.parseDuckDuckGoResults(response.data, numResults);
      console.log(`[SearchEngine] DuckDuckGo parsed ${results.length} results`);
      return results;
    } catch (error: unknown) {
      console.error(`[SearchEngine] DuckDuckGo search failed`);
      throw error;
    }
  }


  private parseBingResults(html: string, maxResults: number): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();
    const resultSelectors = ['.b_algo', '.b_result', '.b_card'];
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      const elements = $(selector);
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;
        const $element = $(element);
        const $titleElement = $element.find('h2 a, .b_title a, a[data-seid]').first();
        const title = $titleElement.text().trim();
        const url = $titleElement.attr('href') || '';
        const snippet = $element.find('.b_caption p, .b_snippet, .b_descript, p').first().text().trim();
        if (title && url && url.startsWith('http')) {
          results.push({
            title,
            url: this.cleanBingUrl(url),
            description: snippet || 'No description available',
            fullContent: '', contentPreview: '', wordCount: 0, timestamp, fetchStatus: 'success',
          });
        }
      });
    }
    return results;
  }

  private parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();
    $('.result').each((_index, element) => {
      if (results.length >= maxResults) return false;
      const $element = $(element);
      const $titleElement = $element.find('.result__title a');
      const title = $titleElement.text().trim();
      const url = $titleElement.attr('href');
      const snippet = $element.find('.result__snippet').text().trim();
      if (title && url) {
        results.push({
          title,
          url: this.cleanDuckDuckGoUrl(url),
          description: snippet || 'No description available',
          fullContent: '', contentPreview: '', wordCount: 0, timestamp, fetchStatus: 'success',
        });
      }
    });
    return results;
  }

  private cleanBraveUrl(url: string): string { return url.startsWith('//') ? 'https:' + url : url; }
  private cleanBingUrl(url: string): string { return url.startsWith('//') ? 'https:' + url : url; }
  private cleanDuckDuckGoUrl(url: string): string {
    if (url.startsWith('//duckduckgo.com/l/')) {
      try {
        const urlParams = new URLSearchParams(url.substring(url.indexOf('?') + 1));
        const actualUrl = urlParams.get('uddg');
        if (actualUrl) return decodeURIComponent(actualUrl);
      } catch (e) {}
    }
    return url.startsWith('//') ? 'https:' + url : url;
  }

  private assessResultQuality(results: SearchResult[], originalQuery: string): number {
    if (results.length === 0) return 0;
    const queryWords = originalQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let totalScore = 0;
    for (const result of results) {
      const text = `${result.title} ${result.description}`.toLowerCase();
      let matches = 0;
      for (const word of queryWords) { if (text.includes(word)) matches++; }
      totalScore += matches / (queryWords.length || 1);
    }
    return totalScore / results.length;
  }

  private async handleBrowserError(error: any, engineName: string): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('closed')) {
      await this.browserPool.closeAll();
    }
  }

  // Finding #3: Dismiss cookie consent / "Before you continue" walls
  private async dismissConsent(page: any): Promise<void> {
    const selectors = [
      '#bnp_btn_accept',           // Bing cookie consent
      '#bnp_ttc_close',            // Bing "take a tour" close
      'button[id*="accept"]',      // Generic accept buttons
      'button[id*="consent"]',     // Generic consent buttons
      'button.accept',             // Brave consent
      '.modal-footer button',      // Brave modal
      '#onetrust-accept-btn-handler', // OneTrust (common third-party)
      'button[aria-label*="Accept"]', // ARIA-labelled accept buttons
    ];
    try {
      for (const selector of selectors) {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible().catch(() => false);
          if (isVisible) {
            console.log(`[SearchEngine] Consent: Clicking "${selector}"`);
            await element.click();
            await page.waitForTimeout(500);
          }
        }
      }
    } catch (e: any) {
      // Consent dismissal is best-effort, never block on failure
    }
  }
}

// Finding #2: Expanded User-Agent pool to reduce fingerprint flagging
function getRandomUserAgent(): string {
  const ua = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0',
  ];
  return ua[Math.floor(Math.random() * ua.length)];
}

// Finding #2: Randomize viewport and device attributes (Canvas/Hardware spoofing)
function getRandomViewportAndDevice(): { viewport: { width: number; height: number }; hasTouch: boolean; isMobile: boolean } {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ];
  const viewport = viewports[Math.floor(Math.random() * viewports.length)];
  const hasTouch = false; // MUST be false, Bing changes DOM to unparseable mobile touch UI if true
  const isMobile = false; // Stick to Desktop UAs for now to match the parsed logic
  
  return { viewport, hasTouch, isMobile };
}

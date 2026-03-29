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

        // Configuration from environment variables
        const enableQualityCheck = this.config.enableRelevanceChecking;
        const qualityThreshold = this.config.relevanceThreshold;
        const forceMultiEngine = this.config.forceMultiEngineSearch;
        const debugBrowsers = this.config.debugBrowserLifecycle;

        console.log(`[SearchEngine] Quality checking: ${enableQualityCheck}, threshold: ${qualityThreshold}, multi-engine: ${forceMultiEngine}, debug: ${debugBrowsers}`);

        // Try multiple approaches to get search results, starting with most reliable
        const approaches = [
          { method: this.tryBrowserBingSearch.bind(this), name: 'Browser Bing' },
          { method: this.tryBrowserBraveSearch.bind(this), name: 'Browser Brave' },
          { method: this.tryDuckDuckGoSearch.bind(this), name: 'Axios DuckDuckGo' }
        ];

        let bestResults: SearchResult[] = [];
        let bestEngine = 'None';
        let bestQuality = 0;

        for (let i = 0; i < approaches.length; i++) {
          const approach = approaches[i];
          try {
            console.log(`[SearchEngine] Attempting ${approach.name} (${i + 1}/${approaches.length})...`);

            // Use more aggressive timeouts for faster fallback
            const approachTimeout = Math.min(timeout / 3, 4000); // Max 4 seconds per approach for faster fallback
            const results = await approach.method(sanitizedQuery, numResults, approachTimeout);
            if (results.length > 0) {
              console.log(`[SearchEngine] Found ${results.length} results with ${approach.name}`);

              // Validate result quality to detect irrelevant results
              const qualityScore = enableQualityCheck ? this.assessResultQuality(results, sanitizedQuery) : 1.0;
              console.log(`[SearchEngine] ${approach.name} quality score: ${qualityScore.toFixed(2)}/1.0`);

              // Track the best results so far
              if (qualityScore > bestQuality) {
                bestResults = results;
                bestEngine = approach.name;
                bestQuality = qualityScore;
              }

              // If quality is excellent, return immediately (unless forcing multi-engine)
              if (qualityScore >= 0.8 && !forceMultiEngine) {
                console.log(`[SearchEngine] Excellent quality results from ${approach.name}, returning immediately`);
                return { results, engine: approach.name };
              }

              // If quality is acceptable and this isn't Bing (first engine), return
              if (qualityScore >= qualityThreshold && approach.name !== 'Browser Bing' && !forceMultiEngine) {
                console.log(`[SearchEngine] Good quality results from ${approach.name}, using as primary`);
                return { results, engine: approach.name };
              }

              // If this is the last engine or quality is acceptable, prepare to return
              if (i === approaches.length - 1) {
                if (bestQuality >= qualityThreshold || !enableQualityCheck) {
                  console.log(`[SearchEngine] Using best results from ${bestEngine} (quality: ${bestQuality.toFixed(2)})`);
                  return { results: bestResults, engine: bestEngine };
                } else if (bestResults.length > 0) {
                  console.warn(`[SearchEngine] Warning: Low quality results from all engines, using best available from ${bestEngine}`);
                  return { results: bestResults, engine: bestEngine };
                }
              } else {
                console.log(`[SearchEngine] ${approach.name} results quality: ${qualityScore.toFixed(2)}, continuing to try other engines...`);
              }
            }
          } catch (error) {
            console.error(`[SearchEngine] ${approach.name} approach failed:`, error);
            await this.handleBrowserError(error, approach.name);
          }
        }

        console.log(`[SearchEngine] All approaches failed, returning empty results`);
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

  private async tryBrowserBraveSearch(query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    console.log(`[SearchEngine] Trying browser-based Brave search with shared browser pool...`);
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        browser = await this.browserPool.getBrowser();
        console.log(`[SearchEngine] Brave search attempt ${attempt}/2 with shared browser`);
        const results = await this.tryBrowserBraveSearchInternal(browser, query, numResults, timeout);
        return results;
      } catch (error) {
        console.error(`[SearchEngine] Brave search attempt ${attempt}/2 failed:`, error);
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    throw new Error('All Brave search attempts failed');
  }

  private async tryBrowserBraveSearchInternal(browser: any, query: string, numResults: number, timeout: number): Promise<SearchResult[]> {
    if (!browser.isConnected()) throw new Error('Browser is not connected');
    let context;
    try {
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });
      const page = await context.newPage();
      const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
      console.log(`[SearchEngine] Browser navigating to Brave: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: timeout });
      try {
        await page.waitForSelector('[data-type="web"]', { timeout: 3000 });
      } catch {
        console.log(`[SearchEngine] Browser Brave results selector not found, proceeding anyway`);
      }
      const html = await page.content();
      console.log(`[SearchEngine] Browser Brave got HTML with length: ${html.length}`);
      const results = this.parseBraveResults(html, numResults);
      console.log(`[SearchEngine] Browser Brave parsed ${results.length} results`);
      return results;
    } catch (error) {
      console.error(`[SearchEngine] Browser Brave search failed:`, error);
      throw error;
    } finally {
      if (context) {
        await context.close().catch((e: any) => console.error(`[SearchEngine] Error closing context:`, e));
      }
    }
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
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        colorScheme: 'light',
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
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
      const page = await context.newPage();
      console.log(`[SearchEngine] BING: Page opened successfully`);
      try {
        console.log(`[SearchEngine] BING: Attempting enhanced search (homepage → form submission)...`);
        const results = await this.tryEnhancedBingSearch(page, query, numResults, timeout);
        console.log(`[SearchEngine] BING: Enhanced search succeeded with ${results.length} results`);
        return results;
      } catch (enhancedError) {
        const errorMessage = enhancedError instanceof Error ? enhancedError.message : 'Unknown error';
        console.error(`[SearchEngine] BING: Enhanced search failed: ${errorMessage}`);
        if (debugBing) console.error(`[SearchEngine] BING: Enhanced search error details:`, enhancedError);
        console.log(`[SearchEngine] BING: Falling back to direct URL search...`);
        const results = await this.tryDirectBingSearch(page, query, numResults, timeout);
        console.log(`[SearchEngine] BING: Direct search succeeded with ${results.length} results`);
        return results;
      }
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
    const debugBing = this.config.debugBingSearch;
    console.log(`[SearchEngine] BING: Enhanced search - navigating to Bing homepage...`);
    const startTime = Date.now();
    await page.goto('https://www.bing.com', { waitUntil: 'domcontentloaded', timeout: timeout / 2 });
    const loadTime = Date.now() - startTime;
    console.log(`[SearchEngine] BING: Homepage loaded in ${loadTime}ms`);
    await page.waitForTimeout(500);
    try {
      console.log(`[SearchEngine] BING: Looking for search form elements...`);
      await page.waitForSelector('#sb_form_q', { timeout: 2000 });
      console.log(`[SearchEngine] BING: Search box found, filling with query: "${query}"`);
      await page.fill('#sb_form_q', query);
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
    console.log(`[SearchEngine] Trying DuckDuckGo as fallback...`);
    try {
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: {
          'User-Agent': getRandomUserAgent(), // Need to import or define this
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

  private parseBraveResults(html: string, maxResults: number): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();
    const resultSelectors = ['[data-type="web"]', '.result', '.fdb'];
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      const elements = $(selector);
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;
        const $element = $(element);
        const titleSelectors = ['.title a', 'h2 a', '.result-title a', 'a[href*="://"]'];
        let title = '';
        let url = '';
        for (const titleSelector of titleSelectors) {
          const $titleElement = $element.find(titleSelector).first();
          if ($titleElement.length) {
            title = $titleElement.text().trim();
            url = $titleElement.attr('href') || '';
            if (title && url && url.startsWith('http')) break;
          }
        }
        const snippet = $element.find('.snippet-content, .snippet, .description, p').first().text().trim();
        if (title && url && url.startsWith('http')) {
          results.push({
            title,
            url: this.cleanBraveUrl(url),
            description: snippet || 'No description available',
            fullContent: '', contentPreview: '', wordCount: 0, timestamp, fetchStatus: 'success',
          });
        }
      });
    }
    return results;
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
}

function getRandomUserAgent(): string {
  const ua = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
  ];
  return ua[Math.floor(Math.random() * ua.length)];
}

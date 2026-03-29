import axios from 'axios';
import * as cheerio from 'cheerio';
import { generateTimestamp, sanitizeQuery } from './utils.js';
import { RateLimiter } from './rate-limiter.js';
export class SearchEngine {
    rateLimiter;
    browserPool;
    config;
    constructor(config, browserPool) {
        this.config = config;
        this.rateLimiter = new RateLimiter(10); // 10 requests per minute
        this.browserPool = browserPool;
    }
    async search(options) {
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
                let bestResults = [];
                let bestEngine = 'None';
                let bestQuality = 0;
                for (let i = 0; i < approaches.length; i++) {
                    const approach = approaches[i];
                    try {
                        console.log(`[SearchEngine] Attempting ${approach.name} (${i + 1}/${approaches.length})...`);
                        // Use more aggressive timeouts for faster fallback
                        const approachTimeout = Math.min(timeout / 3, 10000); // Max 10 seconds per approach for faster fallback
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
                                }
                                else if (bestResults.length > 0) {
                                    console.warn(`[SearchEngine] Warning: Low quality results from all engines, using best available from ${bestEngine}`);
                                    return { results: bestResults, engine: bestEngine };
                                }
                            }
                            else {
                                console.log(`[SearchEngine] ${approach.name} results quality: ${qualityScore.toFixed(2)}, continuing to try other engines...`);
                            }
                        }
                    }
                    catch (error) {
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
        }
        catch (error) {
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
    async tryBrowserBraveSearch(query, numResults, timeout) {
        console.log(`[SearchEngine] Trying browser-based Brave search with shared browser pool...`);
        for (let attempt = 1; attempt <= 2; attempt++) {
            let browser;
            try {
                browser = await this.browserPool.getBrowser();
                console.log(`[SearchEngine] Brave search attempt ${attempt}/2 with shared browser`);
                const results = await this.tryBrowserBraveSearchInternal(browser, query, numResults, timeout);
                return results;
            }
            catch (error) {
                console.error(`[SearchEngine] Brave search attempt ${attempt}/2 failed:`, error);
                if (attempt === 2)
                    throw error;
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        throw new Error('All Brave search attempts failed');
    }
    async tryBrowserBraveSearchInternal(browser, query, numResults, timeout) {
        if (!browser.isConnected())
            throw new Error('Browser is not connected');
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
            });
            const page = await context.newPage();
            const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web`;
            console.log(`[SearchEngine] Browser navigating to Brave: ${searchUrl}`);
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: timeout });
            await this.dismissConsent(page);
            // Feature #4: Brave PoW challenge grace period
            if ((await page.title()).includes('PoW Captcha')) {
                console.log(`[SearchEngine] Brave: PoW Captcha detected, waiting up to 8s for challenge to resolve...`);
                try {
                    await page.waitForSelector('[data-type="web"]', { timeout: 8000 });
                }
                catch {
                    // It might time out, we'll let the next selector catch block handle logging
                }
            }
            try {
                await page.waitForSelector('[data-type="web"]', { timeout: 3000 });
            }
            catch {
                console.log(`[SearchEngine] Browser Brave results selector not found, proceeding anyway`);
            }
            const html = await page.content();
            console.log(`[SearchEngine] Browser Brave got HTML with length: ${html.length}`);
            const results = this.parseBraveResults(html, numResults);
            if (results.length === 0) {
                const pageTitle = await page.title().catch(() => 'unknown');
                console.log(`[SearchEngine] Brave Debug: Page title is "${pageTitle}"`);
            }
            console.log(`[SearchEngine] Browser Brave parsed ${results.length} results`);
            return results;
        }
        catch (error) {
            console.error(`[SearchEngine] Browser Brave search failed:`, error);
            throw error;
        }
        finally {
            if (context) {
                await context.close().catch((e) => console.error(`[SearchEngine] Error closing context:`, e));
            }
        }
    }
    async tryBrowserBingSearch(query, numResults, timeout) {
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
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error(`[SearchEngine] BING: Attempt ${attempt}/2 FAILED with error: ${errorMessage}`);
                if (debugBing)
                    console.error(`[SearchEngine] BING: Full error details:`, error);
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
    async tryBrowserBingSearchInternal(browser, query, numResults, timeout) {
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
            let results = [];
            try {
                console.log(`[SearchEngine] BING: Attempting enhanced search (homepage → form submission)...`);
                results = await this.tryEnhancedBingSearch(page, query, numResults, timeout);
                console.log(`[SearchEngine] BING: Enhanced search returned ${results.length} results`);
            }
            catch (enhancedError) {
                const errorMessage = enhancedError instanceof Error ? enhancedError.message : 'Unknown error';
                console.error(`[SearchEngine] BING: Enhanced search failed: ${errorMessage}`);
                if (debugBing)
                    console.error(`[SearchEngine] BING: Enhanced search error details:`, enhancedError);
            }
            // Finding #1: Fallback to direct search if enhanced returned 0 results OR crashed
            if (results.length === 0) {
                console.log(`[SearchEngine] BING: Enhanced search empty or failed, closing page and trying direct URL search...`);
                await page.close().catch((e) => console.error(`[SearchEngine] BING: Error closing page:`, e));
                page = await context.newPage();
                results = await this.tryDirectBingSearch(page, query, numResults, timeout);
                console.log(`[SearchEngine] BING: Direct search returned ${results.length} results`);
            }
            return results;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[SearchEngine] BING: Internal search failed: ${errorMessage}`);
            if (debugBing)
                console.error(`[SearchEngine] BING: Internal search error details:`, error);
            throw error;
        }
        finally {
            if (context) {
                await context.close().catch((e) => console.error(`[SearchEngine] BING: Error closing context:`, e));
            }
        }
    }
    async tryEnhancedBingSearch(page, query, numResults, timeout) {
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
        }
        catch (formError) {
            const errorMessage = formError instanceof Error ? formError.message : 'Unknown error';
            console.error(`[SearchEngine] BING: Search form submission failed: ${errorMessage}`);
            throw formError;
        }
        await this.dismissConsent(page);
        try {
            console.log(`[SearchEngine] BING: Waiting for search results to appear...`);
            await page.waitForSelector('.b_algo, .b_result', { timeout: 3000 });
            console.log(`[SearchEngine] BING: Search results selector found`);
        }
        catch {
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
    async tryDirectBingSearch(page, query, numResults, timeout) {
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
        }
        catch {
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
    generateConversationId() {
        const chars = '0123456789ABCDEF';
        let cvid = '';
        for (let i = 0; i < 32; i++) {
            cvid += chars[Math.floor(Math.random() * chars.length)];
        }
        return cvid;
    }
    async tryDuckDuckGoSearch(query, numResults, timeout) {
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
                validateStatus: (status) => status < 400,
            });
            console.log(`[SearchEngine] DuckDuckGo got response with status: ${response.status}`);
            const results = this.parseDuckDuckGoResults(response.data, numResults);
            console.log(`[SearchEngine] DuckDuckGo parsed ${results.length} results`);
            return results;
        }
        catch (error) {
            console.error(`[SearchEngine] DuckDuckGo search failed`);
            throw error;
        }
    }
    parseBraveResults(html, maxResults) {
        const $ = cheerio.load(html);
        const results = [];
        const timestamp = generateTimestamp();
        const resultSelectors = ['[data-type="web"]', '.result', '.fdb'];
        for (const selector of resultSelectors) {
            if (results.length >= maxResults)
                break;
            const elements = $(selector);
            elements.each((_index, element) => {
                if (results.length >= maxResults)
                    return false;
                const $element = $(element);
                const titleSelectors = ['.title a', 'h2 a', '.result-title a', 'a[href*="://"]'];
                let title = '';
                let url = '';
                for (const titleSelector of titleSelectors) {
                    const $titleElement = $element.find(titleSelector).first();
                    if ($titleElement.length) {
                        title = $titleElement.text().trim();
                        url = $titleElement.attr('href') || '';
                        if (title && url && url.startsWith('http'))
                            break;
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
    parseBingResults(html, maxResults) {
        const $ = cheerio.load(html);
        const results = [];
        const timestamp = generateTimestamp();
        const resultSelectors = ['.b_algo', '.b_result', '.b_card'];
        for (const selector of resultSelectors) {
            if (results.length >= maxResults)
                break;
            const elements = $(selector);
            elements.each((_index, element) => {
                if (results.length >= maxResults)
                    return false;
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
    parseDuckDuckGoResults(html, maxResults) {
        const $ = cheerio.load(html);
        const results = [];
        const timestamp = generateTimestamp();
        $('.result').each((_index, element) => {
            if (results.length >= maxResults)
                return false;
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
    cleanBraveUrl(url) { return url.startsWith('//') ? 'https:' + url : url; }
    cleanBingUrl(url) { return url.startsWith('//') ? 'https:' + url : url; }
    cleanDuckDuckGoUrl(url) {
        if (url.startsWith('//duckduckgo.com/l/')) {
            try {
                const urlParams = new URLSearchParams(url.substring(url.indexOf('?') + 1));
                const actualUrl = urlParams.get('uddg');
                if (actualUrl)
                    return decodeURIComponent(actualUrl);
            }
            catch (e) { }
        }
        return url.startsWith('//') ? 'https:' + url : url;
    }
    assessResultQuality(results, originalQuery) {
        if (results.length === 0)
            return 0;
        const queryWords = originalQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        let totalScore = 0;
        for (const result of results) {
            const text = `${result.title} ${result.description}`.toLowerCase();
            let matches = 0;
            for (const word of queryWords) {
                if (text.includes(word))
                    matches++;
            }
            totalScore += matches / (queryWords.length || 1);
        }
        return totalScore / results.length;
    }
    async handleBrowserError(error, engineName) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('closed')) {
            await this.browserPool.closeAll();
        }
    }
    // Finding #3: Dismiss cookie consent / "Before you continue" walls
    async dismissConsent(page) {
        const selectors = [
            '#bnp_btn_accept', // Bing cookie consent
            '#bnp_ttc_close', // Bing "take a tour" close
            'button[id*="accept"]', // Generic accept buttons
            'button[id*="consent"]', // Generic consent buttons
            'button.accept', // Brave consent
            '.modal-footer button', // Brave modal
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
        }
        catch (e) {
            // Consent dismissal is best-effort, never block on failure
        }
    }
}
// Finding #2: Expanded User-Agent pool to reduce fingerprint flagging
function getRandomUserAgent() {
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
function getRandomViewportAndDevice() {
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

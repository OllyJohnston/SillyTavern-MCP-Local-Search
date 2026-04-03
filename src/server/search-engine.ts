import axios from 'axios';
import { SearchOptions, SearchResult, SearchResultWithMetadata, ServerConfig } from './types.js';
import { sanitizeQuery } from './utils.js';
import { RateLimiter } from './rate-limiter.js';
import { BrowserPool } from './browser-pool.js';
import { SearchParsers } from './search-parsers.js';
import { ChallengeHandler } from './challenge-handler.js';
import { RelevanceScorer } from './relevance-scorer.js';
import * as Constants from './constants.js';

interface ParallelStatus {
  resultsFound: boolean;
}

/**
 * SearchEngine
 * Orchestrates multi-engine searches with both parallel and sequential phases.
 * Uses specialized modules for parsing, scoring, and anti-bot bypass.
 */
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
    const { query, numResults = Constants.DEFAULT_RESULT_LIMIT, timeout = Constants.TIMEOUT_SEARCH_DEFAULT } = options;
    const sanitizedQuery = sanitizeQuery(query);

    console.log(`${Constants.LOG_PREFIX} [SearchEngine] Starting search for query: "${sanitizedQuery}"`);

    try {
      return await this.rateLimiter.execute(async () => {
        const enableQualityCheck = this.config.enableRelevanceChecking;
        const qualityThreshold = this.config.relevanceThreshold;
        const forceMultiEngine = options.forceMultiEngine !== undefined ? options.forceMultiEngine : this.config.forceMultiEngineSearch;

        // Engine approaches
        const allApproaches = [
          { method: this.tryBrowserBingSearch.bind(this), name: 'Browser Bing', id: 'bing' },
          { method: this.tryDuckDuckGoSearch.bind(this), name: 'Axios DuckDuckGo', id: 'duckduckgo' },
          { method: this.tryStartpageSearch.bind(this), name: 'Axios Startpage', id: 'startpage' }
        ];

        // Determine waterfall order
        let approaches = [];
        const preferredId = options.preferredEngine || 'auto';
        if (preferredId === 'auto') {
          approaches = this.shuffleArray([...allApproaches]);
        } else {
          const main = allApproaches.find(a => a.id === preferredId);
          const others = this.shuffleArray(allApproaches.filter(a => a.id !== preferredId));
          approaches = main ? [main, ...others] : others;
        }

        let bestResults: SearchResult[] = [];
        let bestEngine = 'None';
        let bestQuality = 0;

        // PARALLEL PHASE
        if (forceMultiEngine && approaches.length >= 2) {
          console.log(`${Constants.LOG_PREFIX} [SearchEngine] Launching parallel search: ${approaches[0].name} + ${approaches[1].name}...`);
          const sharedStatus: ParallelStatus = { resultsFound: false };
          const parallelResults = await Promise.allSettled([
            approaches[0].method(sanitizedQuery, numResults, Math.min(timeout / 2, 10000), sharedStatus),
            approaches[1].method(sanitizedQuery, numResults, Math.min(timeout / 2, 8000), sharedStatus)
          ]);

          parallelResults.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value.length > 0) {
              const res = result.value;
              const name = approaches[idx].name;
              const quality = enableQualityCheck ? RelevanceScorer.assessResultQuality(res, sanitizedQuery) : 1.0;
              
              // Merge and deduplicate
              res.forEach(item => {
                if (!bestResults.some(existing => existing.url === item.url)) {
                  bestResults.push(item);
                }
              });
              
              if (quality > bestQuality) {
                bestQuality = quality;
                bestEngine = name;
              }
            } else if (result.status === 'rejected') {
              console.error(`${Constants.LOG_PREFIX} [SearchEngine] Parallel engine ${approaches[idx].name} failed:`, result.reason);
            }
          });

          if (bestResults.length > 0 && bestQuality >= qualityThreshold) {
            const isHighQuality = bestQuality >= Constants.QUALITY_THRESHOLD_EXCELLENT;
            const hasEnoughResults = bestResults.length >= numResults / 2;
            if (isHighQuality || hasEnoughResults) {
              return { results: bestResults, engine: `Merged (${bestEngine})` };
            }
          }
        }

        // SEQUENTIAL WATERFALL
        const startIndex = (forceMultiEngine && approaches.length >= 2) ? 2 : 0;
        for (let i = startIndex; i < approaches.length; i++) {
          const approach = approaches[i];
          try {
            const results = await approach.method(sanitizedQuery, numResults, Math.min(timeout / 3, 10000));
            if (results && results.length > 0) {
              const qualityScore = enableQualityCheck ? RelevanceScorer.assessResultQuality(results, sanitizedQuery) : 1.0;
              if (qualityScore > bestQuality) {
                bestResults = results;
                bestEngine = approach.name;
                bestQuality = qualityScore;
              }
              if (qualityScore >= Constants.QUALITY_THRESHOLD_PERFECT || (qualityScore >= qualityThreshold && !forceMultiEngine)) {
                return { results, engine: approach.name };
              }
            }
          } catch (error) {
            console.error(`${Constants.LOG_PREFIX} [SearchEngine] ${approach.name} failed:`, error);
          }
        }

        return bestResults.length > 0 ? { results: bestResults, engine: bestEngine } : { results: [], engine: 'None' };
      });
    } catch (error) {
      console.error(`${Constants.LOG_PREFIX} [SearchEngine] Search error:`, error);
      throw new Error(`Failed to perform search: ${error instanceof Error ? error.message : 'Unknown error'}`, { cause: error });
    }
  }

  // --- ENGINE METHODS ---

  private async tryStartpageSearch(query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    try {
      const response = await axios.get('https://www.startpage.com/sp/search', {
        params: { query, cat: 'web', lui: 'english', language: 'english' },
        headers: { 'User-Agent': getRandomUserAgent(), 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        timeout
      });
      const results = SearchParsers.parseStartpageResults(response.data, numResults);
      if (results.length > 0 && status) status.resultsFound = true;
      return results;
    } catch {
      console.error(`${Constants.LOG_PREFIX} [SearchEngine] Startpage failed`);
      return [];
    }
  }

  private async tryDuckDuckGoSearch(query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    try {
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: { 'User-Agent': getRandomUserAgent(), 'Referer': 'https://duckduckgo.com/' },
        timeout
      });
      const results = SearchParsers.parseDuckDuckGoResults(response.data, numResults);
      if (results.length > 0 && status) status.resultsFound = true;
      return results;
    } catch {
      console.error(`${Constants.LOG_PREFIX} [SearchEngine] DuckDuckGo failed`);
      return [];
    }
  }

  private async tryBrowserBingSearch(query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let browser;
      try {
        browser = await this.browserPool.getBrowser();
        const results = await this.tryBrowserBingSearchInternal(browser, query, numResults, timeout, status);
        if (results.length > 0) {
          if (status) status.resultsFound = true;
          return results;
        }
        if (attempt === 1 && !status?.resultsFound) {
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
        return [];
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return [];
  }

  private async tryBrowserBingSearchInternal(browser: any, query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    let context;
    try {
      const { viewport, hasTouch, isMobile } = getRandomViewportAndDevice();
      context = await browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport, hasTouch, isMobile,
        locale: 'en-US', timezoneId: 'America/New_York'
      });
      let page = await context.newPage();
      
      let results: SearchResult[] = [];
      try {
        if (status?.resultsFound) return [];
        results = await this.tryEnhancedBingSearch(page, query, numResults, timeout, status);
      } catch (err: unknown) {
        console.warn(`${Constants.LOG_PREFIX} [SearchEngine] Enhanced search failed:`, err instanceof Error ? err.message : 'Unknown error');
      }

      if (results.length === 0 && !status?.resultsFound) {
        await page.close().catch(() => {});
        page = await context.newPage();
        results = await this.tryDirectBingSearch(page, query, numResults, timeout, status);
      }
      return results;
    } finally {
      if (context) {
        await context.close().catch((err: unknown) => {
          console.error(`${Constants.LOG_PREFIX} [SearchEngine] BING: CRITICAL: Error closing context:`, err);
        });
      }
    }
  }

  private async tryEnhancedBingSearch(page: any, query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    await page.goto('https://www.bing.com', { waitUntil: 'domcontentloaded', timeout: Math.max(timeout * 0.8, 5000) });
    await ChallengeHandler.dismissConsent(page);
    
    try {
      await page.waitForSelector('#sb_form_q', { timeout: 4000 }).catch(async () => {
        if (await ChallengeHandler.hasChallenge(page)) await ChallengeHandler.handleBingChallenge(page);
        await page.waitForSelector('#sb_form_q', { timeout: 5000 });
      });
      
      await page.fill('#sb_form_q', query);
      const jitter = Math.floor(Math.random() * (Constants.JITTER_MAX - Constants.JITTER_MIN) + Constants.JITTER_MIN);
      if (status?.resultsFound) return [];
      await page.waitForTimeout(jitter);
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }),
        page.click('#search_icon')
      ]);
    } catch (e: unknown) {
      throw new Error(`Enhanced search form failed: ${e instanceof Error ? e.message : 'Unknown'}`, { cause: e });
    }

    const html = await page.content();
    return SearchParsers.parseBingResults(html, numResults);
  }

  private async tryDirectBingSearch(page: any, query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${numResults}`;
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
      await ChallengeHandler.dismissConsent(page);
      if (await ChallengeHandler.hasChallenge(page)) await ChallengeHandler.handleBingChallenge(page);
    } catch (_e: unknown) {
      console.warn(`${Constants.LOG_PREFIX} [SearchEngine] Direct search navigation error.`);
    }
    const html = await page.content();
    return SearchParsers.parseBingResults(html, numResults);
  }

  private shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

function getRandomUserAgent(): string {
  const ua = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'];
  return ua[Math.floor(Math.random() * ua.length)];
}

function getRandomViewportAndDevice(): { viewport: { width: number; height: number }; hasTouch: boolean; isMobile: boolean } {
  return { viewport: { width: 1920, height: 1080 }, hasTouch: false, isMobile: false };
}

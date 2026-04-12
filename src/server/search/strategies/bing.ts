import { SearchResult } from '../../types.js';
import { SearchStrategy, ParallelStatus } from '../strategy-interface.js';
import { SearchParsers } from '../../search-parsers.js';
import { ChallengeHandler } from '../../challenge-handler.js';
import { BrowserPool } from '../../browser-pool.js';
import * as Constants from '../../constants.js';
import { Logger } from '../../logger.js';

export class BingStrategy implements SearchStrategy {
  name = 'Browser Bing';
  id = 'bing';

  constructor(
    private browserPool: BrowserPool,
    private logger: Logger,
  ) {}

  async search(query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const browser = await this.browserPool.getBrowser();
        const results = await this.executeSearch(browser, query, numResults, timeout, status);

        if (results.length > 0) {
          if (status) status.resultsFound = true;
          return results;
        }

        if (attempt === 1 && !status?.resultsFound) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        return [];
      } catch (error) {
        if (attempt === 2) {
          console.error(`${Constants.LOG_PREFIX} [BingStrategy] Failed after 2 attempts:`, error);
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return [];
  }

  private async executeSearch(
    browser: any,
    query: string,
    numResults: number,
    timeout: number,
    status?: ParallelStatus,
  ): Promise<SearchResult[]> {
    let context;
    try {
      context = await browser.newContext({
        userAgent: this.getRandomUserAgent(),
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
      });
      const page = await context.newPage();

      let results: SearchResult[] = [];
      try {
        if (status?.resultsFound) return [];
        results = await this.tryEnhancedBingSearch(page, query, numResults, timeout, status);
      } catch (err: unknown) {
        console.warn(`${Constants.LOG_PREFIX} [BingStrategy] Enhanced search failed, trying direct.`);
      }

      if (results.length === 0 && !status?.resultsFound) {
        await page.close().catch(() => {});
        const newPage = await context.newPage();
        results = await this.tryDirectBingSearch(newPage, query, numResults, timeout, status);
      }
      return results;
    } finally {
      if (context) {
        await context.close().catch((err: unknown) => {
          console.error(`${Constants.LOG_PREFIX} [BingStrategy] Error closing context:`, err);
        });
      }
    }
  }

  private async tryEnhancedBingSearch(
    page: any,
    query: string,
    numResults: number,
    timeout: number,
    status?: ParallelStatus,
  ): Promise<SearchResult[]> {
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
        page.click('#search_icon'),
      ]);
    } catch (e: unknown) {
      throw new Error(`Enhanced search form failed: ${e instanceof Error ? e.message : 'Unknown'}`, { cause: e });
    }

    const html = await page.content();
    return SearchParsers.parseBingResults(html, numResults);
  }

  private async tryDirectBingSearch(
    page: any,
    query: string,
    numResults: number,
    timeout: number,
    status?: ParallelStatus,
  ): Promise<SearchResult[]> {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${numResults}`;
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout });
      await ChallengeHandler.dismissConsent(page);
      if (await ChallengeHandler.hasChallenge(page)) await ChallengeHandler.handleBingChallenge(page);
    } catch (_e: unknown) {
      console.warn(`${Constants.LOG_PREFIX} [BingStrategy] Direct search navigation error.`);
    }
    const html = await page.content();
    return SearchParsers.parseBingResults(html, numResults);
  }

  private getRandomUserAgent(): string {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  }
}

import { BrowserContext } from 'playwright';
import { ContentExtractionOptions } from '../types.js';
import { ContentCleaner } from './cleaner.js';
import { BrowserPool } from '../browser-pool.js';
import * as Constants from '../constants.js';
import { Logger } from '../logger.js';

/**
 * BrowserContentExtractor
 * Handles headless browser-based content extraction using Playwright.
 */
export class BrowserContentExtractor {
  constructor(
    private browserPool: BrowserPool,
    private logger: Logger,
  ) {}

  /**
   * Extracts content from a URL using a headless browser.
   */
  async extract(options: ContentExtractionOptions, defaults: { timeout: number }): Promise<string> {
    const { url, timeout = defaults.timeout } = options;
    const browser = await this.browserPool.getBrowser();
    let context: BrowserContext | null = null;

    try {
      context = await browser.newContext({
        userAgent: this.getRandomUserAgent(),
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
      });

      const page = await context.newPage();

      // Opt-out of heavy resources to speed up extraction
      await page.route('**/*', async (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'font', 'media'].includes(resourceType)) {
          await route.abort();
        } else {
          await route.continue();
        }
      });

      this.logger.info('Navigating to {}', url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeout, 10000) });

      // Brief human-like delay and micro-movement
      await page.mouse.move(Math.random() * 100, Math.random() * 100);
      await page.waitForTimeout(500 + Math.random() * 1000);

      const rawText = await page.evaluate(() => {
        // Remove known boilerplate selectors
        const selectorsToRemove = ['nav', 'header', 'footer', 'script', 'style', 'noscript', 'iframe'];
        selectorsToRemove.forEach((selector) => {
          document.querySelectorAll(selector).forEach((el) => el.remove());
        });

        // Priority content selectors
        const contentSelectors = ['article', 'main', '[role="main"]', '.content', '.post-content', '.article-body'];
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent && element.textContent.trim().length > 200) {
            return (element as HTMLElement).innerText;
          }
        }
        return document.body.innerText;
      });

      return ContentCleaner.clean(rawText);
    } catch (error) {
      this.logger.error('Failed for {}:', url, { error });
      throw error;
    } finally {
      if (context) {
        await context.close().catch((err: unknown) => {
          this.logger.error('Error closing context:', { error: err });
        });
      }
    }
  }

  private getRandomUserAgent(): string {
    const uas = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    ];
    return uas[Math.floor(Math.random() * uas.length)];
  }
}

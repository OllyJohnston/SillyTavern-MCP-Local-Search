import { chromium, firefox, webkit, Browser } from 'playwright';
import { ServerConfig } from './types.js';
import { Logger } from './logger.js';

/**
 * BrowserPool
 * Manages a rotating pool of headless browser instances (Playwright).
 * Features:
 * - Multi-engine rotation (Chromium, Firefox, WebKit).
 * - Thundering-herd prevention via concurrent launch tracking.
 * - Automatic idle-process release to save memory.
 * - Connection-based health checks.
 */
export class BrowserPool {
  private browsers: Map<string, Browser> = new Map();
  private launchPromises: Map<string, Promise<Browser>> = new Map();
  private maxBrowsers: number;
  private browserTypes: string[];
  private currentBrowserIndex = 0;
  private headless: boolean;
  private lastUsedBrowserType: string = '';
  private config: ServerConfig;
  private logger: Logger;

  /**
   * Initializes the browser pool with server configuration.
   * @param config The global server configuration.
   */
  constructor(config: ServerConfig) {
    this.config = config;
    this.maxBrowsers = config.maxBrowsers;
    this.headless = config.browserHeadless;
    this.browserTypes = config.browserTypes;
    this.logger = new Logger('BrowserPool');

    this.logger.info(
      'Configuration: maxBrowsers={}, headless={}, types={}, noSandbox={}',
      this.maxBrowsers,
      this.headless,
      this.browserTypes.join(','),
      this.config.playwrightNoSandbox,
    );

    // Start initial idle timer
    this.resetIdleTimer();
  }

  private idleTimer: NodeJS.Timeout | null = null;
  private readonly IDLE_TIMEOUT_MS = 120000; // 2 minutes

  private resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(async () => {
      if (this.browsers.size > 0) {
        this.logger.info('Idle limit reached (2m), releasing browser processes to free memory');
        await this.closeAll();
      }
    }, this.IDLE_TIMEOUT_MS);
  }

  /**
   * Acquires a healthy browser instance from the pool.
   * Rotates between configured browser types and launches new ones if needed.
   * @returns A Promise resolving to a Playwright Browser instance.
   */
  async getBrowser(): Promise<Browser> {
    // Activity detected, reset the idle timer
    this.resetIdleTimer();

    // Rotate between browser types for variety
    const browserType = this.browserTypes[this.currentBrowserIndex % this.browserTypes.length];
    this.currentBrowserIndex++;
    this.lastUsedBrowserType = browserType;

    // Check if we already have a healthy cached browser
    if (this.browsers.has(browserType)) {
      const browser = this.browsers.get(browserType)!;

      // Finding #4: Use isConnected() only — no context-based health check
      if (browser.isConnected()) {
        return browser;
      }

      // Browser is disconnected, clean it up
      console.warn(`[BrowserPool] Browser ${browserType} is disconnected, removing from pool`);
      this.browsers.delete(browserType);
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }

    // Finding #1: Prevent thundering herd — if a launch is already in-flight
    // for this browser type, await the existing promise instead of spawning a duplicate
    if (this.launchPromises.has(browserType)) {
      console.log(`[BrowserPool] Launch already in-flight for ${browserType}, awaiting existing promise`);
      return await this.launchPromises.get(browserType)!;
    }

    // Launch new browser and register the promise to prevent concurrent duplicates
    console.log(`[BrowserPool] Launching new ${browserType} browser`);

    const launchPromise = this.launchBrowser(browserType);
    this.launchPromises.set(browserType, launchPromise);

    try {
      const browser = await launchPromise;
      return browser;
    } finally {
      // Always clear the in-flight promise, whether launch succeeded or failed
      this.launchPromises.delete(browserType);
    }
  }

  private async launchBrowser(browserType: string): Promise<Browser> {
    const launchOptions = {
      headless: this.headless,
      args: [
        ...(this.config.playwrightNoSandbox ? ['--no-sandbox'] : []),
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
      ],
    };

    let browser: Browser;
    try {
      switch (browserType) {
        case 'chromium':
          browser = await chromium.launch(launchOptions);
          break;
        case 'firefox':
          browser = await firefox.launch(launchOptions);
          break;
        case 'webkit':
          browser = await webkit.launch(launchOptions);
          break;
        default:
          browser = await chromium.launch(launchOptions);
      }

      // Close any old browser this replaces before storing the new one
      if (this.browsers.has(browserType)) {
        const oldBrowser = this.browsers.get(browserType)!;
        try {
          await oldBrowser.close();
        } catch {
          // Already closed, ignore
        }
      }

      this.browsers.set(browserType, browser);

      // Clean up old browsers if we have too many
      if (this.browsers.size > this.maxBrowsers) {
        const oldestBrowser = this.browsers.entries().next().value;
        if (oldestBrowser) {
          try {
            await oldestBrowser[1].close();
          } catch {
            console.error(`[BrowserPool] Error closing old browser`);
          }
          this.browsers.delete(oldestBrowser[0]);
        }
      }

      return browser;
    } catch (error) {
      this.logger.error('Failed to launch {} browser:', browserType, { error });
      throw error;
    }
  }

  /**
   * Closes all active browser processes and clears the pool.
   * Should be called during plugin shutdown.
   */
  async closeAll(): Promise<void> {
    this.logger.info('Closing {} browsers', this.browsers.size);

    const closePromises = Array.from(this.browsers.values()).map((browser) =>
      browser.close().catch((err: unknown) => console.error('Error closing browser:', err)),
    );

    await Promise.all(closePromises);
    this.browsers.clear();
    this.launchPromises.clear();
  }

  getLastUsedBrowserType(): string {
    return this.lastUsedBrowserType;
  }
}

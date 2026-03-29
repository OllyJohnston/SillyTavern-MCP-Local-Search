import { chromium, firefox, webkit, Browser } from 'playwright';
import { ServerConfig } from './types.js';

export class BrowserPool {
  private browsers: Map<string, Browser> = new Map();
  private launchPromises: Map<string, Promise<Browser>> = new Map();
  private maxBrowsers: number;
  private browserTypes: string[];
  private currentBrowserIndex = 0;
  private headless: boolean;
  private lastUsedBrowserType: string = '';
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.maxBrowsers = config.maxBrowsers;
    this.headless = config.browserHeadless;
    this.browserTypes = config.browserTypes;
    
    console.log(`[BrowserPool] Configuration: maxBrowsers=${this.maxBrowsers}, headless=${this.headless}, types=${this.browserTypes.join(',')}, noSandbox=${this.config.playwrightNoSandbox}`);
  }

  async getBrowser(): Promise<Browser> {
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
      } catch (closeError) {
        // Already disconnected, ignore
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
        } catch (_e) {
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
          } catch (error) {
            console.error(`[BrowserPool] Error closing old browser:`, error);
          }
          this.browsers.delete(oldestBrowser[0]);
        }
      }

      return browser;
    } catch (error) {
      console.error(`[BrowserPool] Failed to launch ${browserType} browser:`, error);
      throw error;
    }
  }

  async closeAll(): Promise<void> {
    console.log(`[BrowserPool] Closing ${this.browsers.size} browsers`);
    
    const closePromises = Array.from(this.browsers.values()).map(browser => 
      browser.close().catch((error: any) => 
        console.error('Error closing browser:', error)
      )
    );
    
    await Promise.all(closePromises);
    this.browsers.clear();
    this.launchPromises.clear();
  }

  getLastUsedBrowserType(): string {
    return this.lastUsedBrowserType;
  }
}

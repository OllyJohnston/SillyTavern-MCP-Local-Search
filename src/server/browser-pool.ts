import { chromium, firefox, webkit, Browser } from 'playwright';
import { ServerConfig } from './types.js';

export class BrowserPool {
  private browsers: Map<string, Browser> = new Map();
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

    if (this.browsers.has(browserType)) {
      const browser = this.browsers.get(browserType)!;
      
      // Check if browser is still connected and healthy
      try {
        if (browser.isConnected()) {
          // Quick health check by trying to create and close a context
          const testContext = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
          });
          await testContext.close();
          return browser;
        }
      } catch (error) {
        console.error(`[BrowserPool] Browser ${browserType} health check failed:`, error);
        // Browser is unhealthy, remove it and close if possible
        this.browsers.delete(browserType);
        try {
          await browser.close();
        } catch (closeError) {
          console.error(`[BrowserPool] Error closing unhealthy browser:`, closeError);
        }
      }
    }

    // Launch new browser
    console.log(`[BrowserPool] Launching new ${browserType} browser`);
    
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
      browser.close().catch(error => 
        console.error('Error closing browser:', error)
      )
    );
    
    await Promise.all(closePromises);
    this.browsers.clear();
  }

  getLastUsedBrowserType(): string {
    return this.lastUsedBrowserType;
  }
}

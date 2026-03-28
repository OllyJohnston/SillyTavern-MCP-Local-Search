import axios from 'axios';
import * as cheerio from 'cheerio';
import { cleanText, getWordCount, getContentPreview, generateTimestamp, isPdfUrl } from './utils.js';
export class EnhancedContentExtractor {
    defaultTimeout;
    maxContentLength;
    browserPool;
    fallbackThreshold;
    config;
    constructor(config, browserPool) {
        this.config = config;
        this.defaultTimeout = config.defaultTimeout;
        this.maxContentLength = config.maxContentLength;
        this.browserPool = browserPool;
        this.fallbackThreshold = config.browserFallbackThreshold;
        console.log(`[EnhancedContentExtractor] Configuration: timeout=${this.defaultTimeout}, maxContentLength=${this.maxContentLength}, fallbackThreshold=${this.fallbackThreshold}`);
    }
    async extractContent(options) {
        const { url } = options;
        console.log(`[EnhancedContentExtractor] Starting extraction for: ${url}`);
        try {
            const content = await this.extractWithAxios(options);
            console.log(`[EnhancedContentExtractor] Successfully extracted with axios: ${content.length} chars`);
            return content;
        }
        catch (error) {
            console.warn(`[EnhancedContentExtractor] Axios failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            if (this.shouldUseBrowser(error, url)) {
                console.log(`[EnhancedContentExtractor] Falling back to headless browser for: ${url}`);
                try {
                    const content = await this.extractWithBrowser(options);
                    console.log(`[EnhancedContentExtractor] Successfully extracted with browser: ${content.length} chars`);
                    return content;
                }
                catch (browserError) {
                    console.error(`[EnhancedContentExtractor] Browser extraction also failed:`, browserError);
                    throw new Error(`Both axios and browser extraction failed for ${url}`);
                }
            }
            else {
                throw error;
            }
        }
    }
    async extractWithAxios(options) {
        const { url, timeout = this.defaultTimeout, maxContentLength = this.maxContentLength } = options;
        const response = await axios.get(url, {
            headers: this.getRandomHeaders(),
            timeout,
            validateStatus: (status) => status < 400,
        });
        let content = this.parseContent(response.data);
        if (maxContentLength && content.length > maxContentLength) {
            content = content.substring(0, maxContentLength);
        }
        if (this.isLowQualityContent(content)) {
            throw new Error('Low quality content detected - likely bot detection');
        }
        return content;
    }
    async extractWithBrowser(options) {
        const { url, timeout = this.defaultTimeout } = options;
        const browser = await this.browserPool.getBrowser();
        try {
            const context = await browser.newContext({
                userAgent: this.getRandomUserAgent(),
                viewport: this.getRandomViewport(),
                locale: 'en-US',
            });
            const page = await context.newPage();
            await page.route('**/*', (route) => {
                const resourceType = route.request().resourceType();
                if (['image', 'font', 'media'].includes(resourceType)) {
                    route.abort();
                }
                else {
                    route.continue();
                }
            });
            console.log(`[BrowserExtractor] Navigating to ${url}`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeout, 8000) });
            await page.mouse.move(Math.random() * 100, Math.random() * 100);
            await page.waitForTimeout(500 + Math.random() * 1000);
            const extractedData = await page.evaluate(() => {
                const selectorsToRemove = ['nav', 'header', 'footer', 'script', 'style', 'noscript', 'iframe'];
                selectorsToRemove.forEach(selector => { document.querySelectorAll(selector).forEach(el => el.remove()); });
                const contentSelectors = ['shreddit-post', 'article', 'main', '[role="main"]', '.content', '.post-content'];
                for (const selector of contentSelectors) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent && element.textContent.trim().length > 200) {
                        return { text: element.innerText, selectorUsed: selector };
                    }
                }
                return { text: document.body.innerText, selectorUsed: 'body' };
            });
            const content = this.cleanTextContent(extractedData.text);
            await context.close();
            return content;
        }
        catch (error) {
            console.error(`[BrowserExtractor] Browser extraction failed for ${url}:`, error);
            throw error;
        }
    }
    shouldUseBrowser(error, url) {
        const indicators = [
            error.response?.status === 403,
            error.response?.status === 429,
            error.message?.includes('timeout'),
            error.message?.includes('Low quality content'),
            url.includes('reddit.com'),
            url.includes('twitter.com')
        ];
        return indicators.some(indicator => indicator === true);
    }
    isLowQualityContent(content) {
        return content.length < 100 || content.includes('JavaScript') || content.includes('robot');
    }
    getRandomHeaders() {
        return {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        };
    }
    getRandomUserAgent() { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'; }
    getRandomViewport() { return { width: 1920, height: 1080 }; }
    async extractContentForResults(results, targetCount = results.length) {
        const nonPdfResults = results.filter(result => !isPdfUrl(result.url));
        const resultsToProcess = nonPdfResults.slice(0, targetCount);
        const extractionPromises = resultsToProcess.map(async (result) => {
            try {
                const content = await Promise.race([
                    this.extractContent({ url: result.url, timeout: 6000 }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
                ]);
                const cleanedContent = cleanText(content, this.maxContentLength);
                return {
                    ...result,
                    fullContent: cleanedContent,
                    contentPreview: getContentPreview(cleanedContent),
                    wordCount: getWordCount(cleanedContent),
                    timestamp: generateTimestamp(),
                    fetchStatus: 'success',
                };
            }
            catch (error) {
                return {
                    ...result,
                    fullContent: '',
                    contentPreview: '',
                    wordCount: 0,
                    timestamp: generateTimestamp(),
                    fetchStatus: 'error',
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }
        });
        return await Promise.all(extractionPromises);
    }
    parseContent(html) {
        const $ = cheerio.load(html);
        $('script, style, nav, header, footer').remove();
        let mainContent = $('article, main, .content, .post-content, body').first().text().trim();
        return this.cleanTextContent(mainContent);
    }
    cleanTextContent(text) {
        return text.replace(/\s+/g, ' ').trim();
    }
}

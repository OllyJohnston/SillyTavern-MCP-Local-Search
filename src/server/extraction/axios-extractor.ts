import axios from 'axios';
import * as https from 'https';
import { ContentExtractionOptions } from '../types.js';
import { ContentCleaner } from './cleaner.js';
import { ContentValidator } from './validator.js';

/**
 * AxiosContentExtractor
 * Handles HTTP-based content extraction using axios.
 */
export class AxiosContentExtractor {
  /**
   * Extracts content from a URL using axios.
   */
  static async extract(
    options: ContentExtractionOptions,
    defaults: { timeout: number; maxContentLength: number },
  ): Promise<string> {
    const { url, timeout = defaults.timeout, maxContentLength = defaults.maxContentLength } = options;
    const controller = new AbortController();

    try {
      const response = await axios.get(url, {
        headers: this.getRandomHeaders(),
        timeout,
        signal: controller.signal,
        validateStatus: (status: number) => status < 400,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });

      let content = ContentCleaner.parse(response.data);

      if (maxContentLength && content.length > maxContentLength) {
        content = content.substring(0, maxContentLength);
      }

      if (ContentValidator.isLowQuality(content)) {
        throw new Error('Low quality content detected - likely bot detection');
      }

      return content;
    } catch (error) {
      controller.abort();
      throw error;
    }
  }

  /**
   * Generates randomized headers to avoid basic bot detection.
   */
  private static getRandomHeaders(): Record<string, string> {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    ];
    return {
      'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      Referer: 'https://www.google.com/',
    };
  }
}

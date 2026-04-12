import * as cheerio from 'cheerio';
import { sanitizeContent } from '../security.js';

/**
 * ContentCleaner
 * Responsible for parsing HTML and cleaning text content.
 */
export class ContentCleaner {
  /**
   * Parses raw HTML into clean text content, removing boilerplate.
   */
  static parse(html: string): string {
    const $ = cheerio.load(html);
    // Remove common non-content elements
    $('script, style, nav, header, footer, iframe, noscript').remove();

    // Attempt to find main content areas
    const mainContent = $('article, main, .content, .post-content, body').first().text().trim();
    return this.clean(mainContent);
  }

  /**
   * Sanitizes and normalizes text content.
   */
  static clean(text: string): string {
    // Phase 1 Security: Sanitize text with DOMPurify
    const sanitized = sanitizeContent(text);
    // Normalize whitespace
    return sanitized.replace(/\s+/g, ' ').trim();
  }
}

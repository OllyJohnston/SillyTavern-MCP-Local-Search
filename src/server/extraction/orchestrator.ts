import { ContentExtractionOptions, SearchResult, ServerConfig } from '../types.js';
import { cleanText, getWordCount, getContentPreview, generateTimestamp, isPdfUrl } from '../utils.js';
import { BrowserPool } from '../browser-pool.js';
import { isValidUrl, validateUrlSafety } from '../security.js';
import * as Constants from '../constants.js';
import { Logger } from '../logger.js';

import { AxiosContentExtractor } from './axios-extractor.js';
import { BrowserContentExtractor } from './browser-extractor.js';
import { ContentValidator } from './validator.js';

/**
 * ExtractionOrchestrator
 * Coordinates the multi-phase content extraction process.
 * Features:
 * - Sequential waterfall: Axios (Fast) -> Headless Browser (Robust FALLBACK).
 * - DNS-level SSRF protection via hostname validation.
 * - Content quality assessment and bot-detection triggers.
 * - Text sanitization and word count tracking.
 */
export class ExtractionOrchestrator {
  private readonly defaultTimeout: number;
  private readonly maxContentLength: number;
  private browserExtractor: BrowserContentExtractor;

  /**
   * Initializes the orchestrator and its subordinate extractors.
   * @param config Global server configuration.
   * @param browserPool Shared browser instance pool (for the BrowserFallback).
   * @param logger Shared logger instance for service-wide telemetry.
   */
  constructor(
    private config: ServerConfig,
    browserPool: BrowserPool,
    private logger: Logger,
  ) {
    this.defaultTimeout = config.defaultTimeout || Constants.TIMEOUT_EXTRACTION_DEFAULT;
    this.maxContentLength = config.maxContentLength;
    this.browserExtractor = new BrowserContentExtractor(browserPool, logger);

    this.logger.info('Initialized: timeout={}, maxContentLength={}', this.defaultTimeout, this.maxContentLength);
  }

  /**
   * High-level entry point for single URL extraction.
   * Automatically attempts Axios first, falling back to Browser if needed.
   * @param options Extraction parameters (url, timeout limits).
   * @returns A Promise resolving to the cleaned plain-text content.
   */
  async extract(options: ContentExtractionOptions): Promise<string> {
    const { url } = options;

    if (!(await validateUrlSafety(url, this.config.allowedDomains, this.config.blockedDomains))) {
      throw new Error(`Rejected unsafe, restricted, or malformed URL: ${url}`, { cause: 'Security Violation' });
    }

    try {
      // Phase 1: Try Axios
      return await AxiosContentExtractor.extract(options, {
        timeout: this.defaultTimeout,
        maxContentLength: this.maxContentLength,
      });
    } catch (error) {
      // Phase 2: Check if we should fallback to Browser
      if (ContentValidator.shouldUseBrowserFallback(error, url)) {
        this.logger.info('Falling back to browser for: {}', url);
        return await this.browserExtractor.extract(options, { timeout: this.defaultTimeout });
      }
      throw error;
    }
  }

  /**
   * Batch extraction for multiple search results.
   * Processes results in parallel with status tracking.
   * @param results The list of search results to enrich.
   * @param targetCount Maximum number of results to process.
   * @returns A Promise resolving to an array of enriched SearchResults.
   */
  async extractForResults(results: SearchResult[], targetCount: number = results.length): Promise<SearchResult[]> {
    const nonPdfResults = results.filter((result) => !isPdfUrl(result.url));
    const toProcess = nonPdfResults.slice(0, targetCount);

    const promises = toProcess.map(async (result): Promise<SearchResult> => {
      try {
        const content = await this.extract({ url: result.url, timeout: 6000 });
        const cleaned = cleanText(content, this.maxContentLength);

        return {
          ...result,
          fullContent: cleaned,
          contentPreview: getContentPreview(cleaned),
          wordCount: getWordCount(cleaned),
          timestamp: generateTimestamp(),
          fetchStatus: 'success',
        };
      } catch (error) {
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

    return await Promise.all(promises);
  }
}

import { SearchOptions, SearchResult, SearchResultWithMetadata, ServerConfig } from '../types.js';
import { sanitizeQuery } from '../utils.js';
import { RateLimiter } from '../rate-limiter.js';
import { BrowserPool } from '../browser-pool.js';
import { RelevanceScorer } from '../relevance-scorer.js';
import * as Constants from '../constants.js';
import { Logger } from '../logger.js';

import { ParallelStatus, SearchStrategy } from './strategy-interface.js';
import { BingStrategy } from './strategies/bing.js';
import { DuckDuckGoStrategy } from './strategies/duckduckgo.js';
import { StartpageStrategy } from './strategies/startpage.js';
import { ResultMerger } from './result-merger.js';

/**
 * SearchOrchestrator
 * Coordinates multi-engine searches using the Strategy pattern.
 * Provides abstract orchestration over Bing, DuckDuckGo, and Startpage.
 * Features:
 * - Rate limiting (10 requests/min).
 * - Parallel execution for speed (if forced).
 * - Sequential waterfall for reliability.
 * - Relevance-based result selection.
 */
export class SearchOrchestrator {
  private readonly rateLimiter: RateLimiter;
  private strategies: SearchStrategy[];

  /**
   * Initializes the orchestrator and its subordinate engine strategies.
   * @param config Global server configuration.
   * @param browserPool Shared browser instance pool (for browser-based strategies).
   * @param logger Shared logger instance for service-wide telemetry.
   */
  constructor(
    private config: ServerConfig,
    browserPool: BrowserPool,
    private logger: Logger,
  ) {
    this.rateLimiter = new RateLimiter(10); // 10 requests per minute

    // Initialize strategies
    this.strategies = [
      new BingStrategy(browserPool, logger),
      new DuckDuckGoStrategy(logger),
      new StartpageStrategy(logger),
    ];
  }

  /**
   * Primary search entry point.
   * Executes a search across multiple engines based on configuration.
   * @param options Search parameters (query, limit, preferred engine).
   * @returns A Promise resolving to search results with metadata.
   */
  async search(options: SearchOptions): Promise<SearchResultWithMetadata> {
    const { query, numResults = Constants.DEFAULT_RESULT_LIMIT, timeout = Constants.TIMEOUT_SEARCH_DEFAULT } = options;
    const sanitizedQuery = sanitizeQuery(query);

    this.logger.info('Starting search for: "{}"', sanitizedQuery);

    try {
      return await this.rateLimiter.execute(async () => {
        const qualityThreshold = this.config.relevanceThreshold;
        const forceMultiEngine = options.forceMultiEngine ?? this.config.forceMultiEngineSearch;

        // Determine execution order
        const approaches = this.getOrderedStrategies(options.preferredEngine);

        let bestResults: SearchResult[] = [];
        let bestEngine = 'None';
        let bestQuality = 0;

        // Phase 1: PARALLEL (if enabled)
        if (forceMultiEngine && approaches.length >= 2) {
          this.logger.info('Launching parallel: {} + {}', approaches[0].name, approaches[1].name);
          const sharedStatus: ParallelStatus = { resultsFound: false };

          const parallelResults = await Promise.allSettled([
            approaches[0].search(sanitizedQuery, numResults, Math.min(timeout / 2, 10000), sharedStatus),
            approaches[1].search(sanitizedQuery, numResults, Math.min(timeout / 2, 8000), sharedStatus),
          ]);

          parallelResults.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value.length > 0) {
              const res = result.value;
              const name = approaches[idx].name;
              const quality = this.config.enableRelevanceChecking
                ? RelevanceScorer.assessResultQuality(res, sanitizedQuery)
                : 1.0;

              // Merge results
              bestResults = ResultMerger.merge([bestResults, res]);

              if (quality > bestQuality) {
                bestQuality = quality;
                bestEngine = name;
              }
            }
          });

          if (bestResults.length > 0 && bestQuality >= qualityThreshold) {
            return { results: bestResults, engine: `Merged (${bestEngine})` };
          }
        }

        // Phase 2: SEQUENTIAL WATERFALL
        const startIndex = forceMultiEngine && approaches.length >= 2 ? 2 : 0;
        for (let i = startIndex; i < approaches.length; i++) {
          const strategy = approaches[i];
          try {
            const results = await strategy.search(sanitizedQuery, numResults, Math.min(timeout / 3, 10000));
            if (results && results.length > 0) {
              const quality = this.config.enableRelevanceChecking
                ? RelevanceScorer.assessResultQuality(results, sanitizedQuery)
                : 1.0;

              if (quality > bestQuality) {
                bestResults = results;
                bestEngine = strategy.name;
                bestQuality = quality;
              }

              if (
                quality >= Constants.QUALITY_THRESHOLD_PERFECT ||
                (quality >= qualityThreshold && !forceMultiEngine)
              ) {
                return { results, engine: strategy.name };
              }
            }
          } catch (error) {
            this.logger.error('{} failed:', strategy.name, { error });
          }
        }

        return bestResults.length > 0 ? { results: bestResults, engine: bestEngine } : { results: [], engine: 'None' };
      });
    } catch (error) {
      this.logger.error('Search error:', { error });
      throw error;
    }
  }

  private getOrderedStrategies(preferredId?: string): SearchStrategy[] {
    const id = preferredId || 'auto';
    if (id === 'auto') {
      return ResultMerger.shuffle(this.strategies);
    }

    const main = this.strategies.find((s) => s.id === id);
    const others = ResultMerger.shuffle(this.strategies.filter((s) => s.id !== id));
    return main ? [main, ...others] : others;
  }
}

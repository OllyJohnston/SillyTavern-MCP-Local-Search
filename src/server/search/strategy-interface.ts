import { SearchResult } from '../types.js';

export interface ParallelStatus {
  resultsFound: boolean;
}

/**
 * SearchStrategy
 * Interface for specific search engine implementations.
 */
export interface SearchStrategy {
  name: string;
  id: string;

  /**
   * Executes a search query using this strategy.
   * @param query The sanitized search query.
   * @param numResults Maximum number of results to return.
   * @param timeout Timeout in milliseconds for this specific attempt.
   * @param status Shared status object for parallel coordination.
   */
  search(query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]>;
}

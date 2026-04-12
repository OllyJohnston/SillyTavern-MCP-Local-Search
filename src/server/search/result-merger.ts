import { SearchResult } from '../types.js';

/**
 * ResultMerger
 * Handles merging and deduplication of results from multiple search engines.
 */
export class ResultMerger {
  /**
   * Merges multiple arrays of search results, removing duplicates based on URL.
   */
  static merge(allResults: SearchResult[][]): SearchResult[] {
    const unique = new Map<string, SearchResult>();

    for (const resultSet of allResults) {
      for (const result of resultSet) {
        if (!unique.has(result.url)) {
          unique.set(result.url, result);
        }
      }
    }

    return Array.from(unique.values());
  }

  /**
   * Shuffles an array in place.
   */
  static shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

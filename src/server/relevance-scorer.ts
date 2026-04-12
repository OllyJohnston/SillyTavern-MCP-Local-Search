import { SearchResult } from './types.js';

export class RelevanceScorer {
  /**
   * Assesses the quality of search results based on the original query
   * Returns a score between 0 and 1.0
   */
  public static assessResultQuality(results: SearchResult[], originalQuery: string): number {
    if (results.length === 0) return 0;

    const queryWords = originalQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (queryWords.length === 0) return 1.0;

    let totalScore = 0;

    for (const result of results) {
      const text = `${result.title} ${result.description}`.toLowerCase();
      let matches = 0;

      for (const word of queryWords) {
        if (text.includes(word)) {
          matches++;
        }
      }

      // Relevance for this specific result
      totalScore += matches / queryWords.length;
    }

    // Average relevance across all results
    return totalScore / results.length;
  }
}

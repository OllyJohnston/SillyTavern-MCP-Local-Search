import { describe, it, expect } from 'vitest';
import { SearchParsers } from '../server/search-parsers.js';

describe('SearchParsers', () => {
  describe('parseBingResults', () => {
    it('should correctly parse valid Bing search results HTML', () => {
      const html = `
        <div class="b_algo">
          <h2><a href="https://example.com/1">Example 1</a></h2>
          <div class="b_caption"><p>Description 1</p></div>
        </div>
        <div class="b_result">
          <h2><a href="https://example.com/2">Example 2</a></h2>
          <div class="b_snippet">Description 2</div>
        </div>
      `;
      const results = SearchParsers.parseBingResults(html, 10);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Example 1');
      expect(results[0].url).toBe('https://example.com/1');
      expect(results[1].title).toBe('Example 2');
      expect(results[1].url).toBe('https://example.com/2');
    });

    it('should respect maxResults limit', () => {
      const html = `
        <div class="b_algo"><h2><a href="https://1">1</a></h2></div>
        <div class="b_algo"><h2><a href="https://2">2</a></h2></div>
      `;
      const results = SearchParsers.parseBingResults(html, 1);
      expect(results).toHaveLength(1);
    });

    it('should return empty array for invalid HTML', () => {
      const results = SearchParsers.parseBingResults('<html><body>Nothing here</body></html>', 10);
      expect(results).toEqual([]);
    });

    it('should filter out results without valid URLs', () => {
      const html = `
        <div class="b_algo"><h2><a href="not-a-url">Invalid</a></h2></div>
      `;
      const results = SearchParsers.parseBingResults(html, 10);
      expect(results).toEqual([]);
    });
  });

  describe('parseDuckDuckGoResults', () => {
    it('should correctly parse valid DDG search results HTML', () => {
      const html = `
        <div class="result">
          <h2 class="result__title"><a href="https://example.com">DDG Result</a></h2>
          <div class="result__snippet">DDG Snippet</div>
        </div>
      `;
      const results = SearchParsers.parseDuckDuckGoResults(html, 10);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('DDG Result');
      expect(results[0].url).toBe('https://example.com');
    });

    it('should handle DDG redirect URLs correctly', () => {
      const html = `
        <div class="result">
          <h2 class="result__title"><a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">Redirect Result</a></h2>
        </div>
      `;
      const results = SearchParsers.parseDuckDuckGoResults(html, 10);
      expect(results[0].url).toBe('https://example.com');
    });
  });

  describe('parseStartpageResults', () => {
    it('should correctly parse valid Startpage search results HTML', () => {
      const html = `
        <div class="result">
          <a class="result-title" href="https://example.com">
            <h3 class="wgl-title">Startpage Title</h3>
          </a>
          <div class="description">Startpage Description</div>
        </div>
      `;
      const results = SearchParsers.parseStartpageResults(html, 10);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Startpage Title');
      expect(results[0].url).toBe('https://example.com');
    });
  });
});

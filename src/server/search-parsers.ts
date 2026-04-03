import * as cheerio from 'cheerio';
import { SearchResult } from './types.js';
import { generateTimestamp } from './utils.js';

/**
 * SearchParsers
 * Specialized class for parsing HTML search results from various engines
 */
export class SearchParsers {
  
  /**
   * Parses Bing search result HTML
   */
  public static parseBingResults(html: string, maxResults: number): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();
    const resultSelectors = ['.b_algo', '.b_result', '.b_card'];
    
    for (const selector of resultSelectors) {
      if (results.length >= maxResults) break;
      const elements = $(selector);
      elements.each((_index, element) => {
        if (results.length >= maxResults) return false;
        const $element = $(element);
        const $titleElement = $element.find('h2 a, .b_title a, a[data-seid]').first();
        const title = $titleElement.text().trim();
        const url = $titleElement.attr('href') || '';
        const snippet = $element.find('.b_caption p, .b_snippet, .b_descript, p').first().text().trim();
        
        if (title && url && url.startsWith('http')) {
          results.push({
            title,
            url: this.cleanBingUrl(url),
            description: snippet || 'No description available',
            fullContent: '', 
            contentPreview: '', 
            wordCount: 0, 
            timestamp, 
            fetchStatus: 'success',
          });
        }
      });
    }
    return results;
  }

  /**
   * Parses DuckDuckGo Lite search result HTML
   */
  public static parseDuckDuckGoResults(html: string, maxResults: number): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();
    
    $('.result').each((_index, element) => {
      if (results.length >= maxResults) return false;
      const $element = $(element);
      const $titleElement = $element.find('.result__title a');
      const title = $titleElement.text().trim();
      const url = $titleElement.attr('href');
      const snippet = $element.find('.result__snippet').text().trim();
      
      if (title && url) {
        results.push({
          title,
          url: this.cleanDuckDuckGoUrl(url),
          description: snippet || 'No description available',
          fullContent: '', 
          contentPreview: '', 
          wordCount: 0, 
          timestamp, 
          fetchStatus: 'success',
        });
      }
    });
    return results;
  }

  /**
   * Parses Startpage search result HTML
   */
  public static parseStartpageResults(html: string, maxResults: number): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];
    const timestamp = generateTimestamp();

    $('.w-gl .result, .result').each((_index, element) => {
      if (results.length >= maxResults) return false;

      const $element = $(element);
      const $titleLink = $element.find('a.result-title').first();
      
      if ($titleLink.length) {
        let title = $titleLink.find('.wgl-title').text().trim();
        if (!title) title = $titleLink.text().trim();
        
        const url = $titleLink.attr('href') || '';
        const snippet = $element.find('.description').text().trim();

        if (title && url && url.startsWith('http')) {
          results.push({
            title,
            url,
            description: snippet || 'No description available',
            fullContent: '',
            contentPreview: '',
            wordCount: 0,
            timestamp,
            fetchStatus: 'success'
          });
        }
      }
    });

    return results;
  }

  private static cleanBingUrl(url: string): string { 
    return url.startsWith('//') ? 'https:' + url : url; 
  }

  private static cleanDuckDuckGoUrl(url: string | undefined): string {
    if (!url) return '';
    if (url.startsWith('//duckduckgo.com/l/')) {
      try {
        const urlParams = new URL(url, 'https://duckduckgo.com').searchParams;
        const actualUrl = urlParams.get('uddg');
        if (actualUrl) return decodeURIComponent(actualUrl);
      } catch (_e) { /* ignore */ }
    }
    return url.startsWith('//') ? 'https:' + url : url;
  }
}

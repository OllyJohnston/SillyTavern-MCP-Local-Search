import axios from 'axios';
import * as https from 'https';
import { SearchResult } from '../../types.js';
import { SearchStrategy, ParallelStatus } from '../strategy-interface.js';
import { SearchParsers } from '../../search-parsers.js';
import * as Constants from '../../constants.js';
import { Logger } from '../../logger.js';

export class DuckDuckGoStrategy implements SearchStrategy {
  name = 'Axios DuckDuckGo';
  id = 'duckduckgo';

  constructor(private logger: Logger) {}

  async search(query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    try {
      if (status?.resultsFound) return [];

      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          Referer: 'https://duckduckgo.com/',
        },
        timeout,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });

      const results = SearchParsers.parseDuckDuckGoResults(response.data, numResults);
      if (results.length > 0 && status) status.resultsFound = true;
      return results;
    } catch (error) {
      this.logger.error('DuckDuckGo search failed:', { error });
      return [];
    }
  }
}

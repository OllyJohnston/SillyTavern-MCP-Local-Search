import axios from 'axios';
import * as https from 'https';
import { SearchResult } from '../../types.js';
import { SearchStrategy, ParallelStatus } from '../strategy-interface.js';
import { SearchParsers } from '../../search-parsers.js';
import * as Constants from '../../constants.js';
import { Logger } from '../../logger.js';

export class StartpageStrategy implements SearchStrategy {
  name = 'Axios Startpage';
  id = 'startpage';

  constructor(private logger: Logger) {}

  async search(query: string, numResults: number, timeout: number, status?: ParallelStatus): Promise<SearchResult[]> {
    try {
      if (status?.resultsFound) return [];

      const response = await axios.get('https://www.startpage.com/sp/search', {
        params: { query, cat: 'web', lui: 'english', language: 'english' },
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });

      const results = SearchParsers.parseStartpageResults(response.data, numResults);
      if (results.length > 0 && status) status.resultsFound = true;
      return results;
    } catch (error) {
      this.logger.error('Startpage search failed:', { error });
      return [];
    }
  }
}

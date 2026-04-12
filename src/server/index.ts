import { Router, Request, Response, json } from 'express';
import { BrowserPool } from './browser-pool.js';
import { SearchOrchestrator } from './search/orchestrator.js';
import { ExtractionOrchestrator } from './extraction/orchestrator.js';
import { ServerConfig } from './types.js';
import { Logger } from './logger.js';

/**
 * Plugin Container to manage instance lifecycle and avoid global state
 */
class PluginContainer {
  public browserPool: BrowserPool;
  public searchEngine: SearchOrchestrator;
  public contentExtractor: ExtractionOrchestrator;
  public config: ServerConfig;
  public logger: Logger;

  constructor(config: ServerConfig) {
    this.config = config;
    this.logger = new Logger();
    this.browserPool = new BrowserPool(config);
    this.searchEngine = new SearchOrchestrator(config, this.browserPool, this.logger);
    this.contentExtractor = new ExtractionOrchestrator(config, this.browserPool, this.logger);
    this.logger.info('PluginContainer initialized with modular orchestrators.');
  }

  async shutdown() {
    this.logger.info('Shutting down plugin container...');
    await this.browserPool.closeAll();
  }
}

let container: PluginContainer | null = null;

const defaultConfig: ServerConfig = {
  maxContentLength: 15000,
  defaultTimeout: 30000,
  maxBrowsers: 2,
  browserHeadless: true,
  browserTypes: ['chromium'],
  browserFallbackThreshold: 0.5,
  enableRelevanceChecking: true,
  relevanceThreshold: 0.3,
  forceMultiEngineSearch: false,
  debugBrowserLifecycle: false,
  debugBingSearch: false,
  playwrightNoSandbox: true,
};

/**
 * SillyTavern Server Plugin Initialization
 */
export async function init(router: Router) {
  // We need a temporary logger before the container is ready
  const bootLogger = new Logger();
  bootLogger.info('Initializing SillyTavern MCP Local Search Plugin v1.4.0...');

  // Initialize Container (handles all core logic instances)
  if (container) {
    await container.shutdown();
  }
  container = new PluginContainer(defaultConfig);

  const jsonParser = json({ limit: '50mb' });

  // API Endpoints
  router.get('/status', (req: Request, res: Response) => {
    res.json({ status: 'running', engine: 'integrated', version: '1.4.0' });
  });

  router.post('/search', jsonParser, async (req: Request, res: Response) => {
    try {
      const {
        query,
        limit = 5,
        options = {},
      } = req.body as unknown as { query: string; limit?: number; options?: any };
      if (!query) return res.status(400).json({ error: 'Query is required' });

      console.log(`[MCPLocalSearch] Received search request: "${query}" (limit: ${limit})`);

      const results = await container!.searchEngine.search({
        query,
        numResults: limit,
        ...options,
      });

      res.json(results);
    } catch (_error: unknown) {
      const message = _error instanceof Error ? _error.message : 'Unknown search error';
      console.error('[MCPLocalSearch] Search error:', message);
      res.status(500).json({ error: message });
    }
  });

  router.post('/extract', jsonParser, async (req: Request, res: Response) => {
    try {
      const { url, options = {} } = req.body as unknown as { url: string; options?: any };
      if (!url) return res.status(400).json({ error: 'URL is required' });

      console.log(`[MCPLocalSearch] Received extraction request for: ${url}`);

      const content = await container!.contentExtractor.extract({
        url,
        ...options,
      });

      res.json({ content });
    } catch (_error: unknown) {
      const message = _error instanceof Error ? _error.message : 'Unknown extraction error';
      container!.logger.error('Extraction error:', { error: message });
      res.status(500).json({ error: message });
    }
  });

  console.log('[MCPLocalSearch] Plugin endpoints registered successfully.');

  // Register process signal handlers for clean exit
  process.on('SIGINT', async () => {
    bootLogger.info('Received SIGINT (Ctrl+C), performing clean shutdown...');
    await exit();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    bootLogger.info('Received SIGTERM (shutdown), performing clean shutdown...');
    await exit();
    process.exit(0);
  });
}

/**
 * SillyTavern Server Plugin Exit Cleanup
 */
export async function exit() {
  console.log('[MCPLocalSearch] Shutting down SillyTavern MCP Local Search Plugin...');
  if (container) {
    await container.shutdown();
    container = null;
  }
}

/**
 * SillyTavern Server Plugin Information
 */
export const info = {
  id: 'mcp-local-search',
  name: 'MCP Local Search',
  description: 'Native high-quality local search and scraping using Playwright.',
  author: 'Olly Johnston',
  version: '1.4.0',
};

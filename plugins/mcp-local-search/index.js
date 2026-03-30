import { json } from 'express';
import { BrowserPool } from './browser-pool.js';
import { SearchEngine } from './search-engine.js';
import { EnhancedContentExtractor } from './enhanced-content-extractor.js';
let browserPool = null;
let searchEngine = null;
let contentExtractor = null;
const defaultConfig = {
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
export async function init(router) {
    console.log('[MCPLocalSearch] Initializing SillyTavern MCP Local Search Plugin...');
    // Initialize Core Logic
    browserPool = new BrowserPool(defaultConfig);
    searchEngine = new SearchEngine(defaultConfig, browserPool);
    contentExtractor = new EnhancedContentExtractor(defaultConfig, browserPool);
    const jsonParser = json({ limit: '50mb' });
    // API Endpoints
    router.get('/status', (req, res) => {
        res.json({ status: 'running', engine: 'integrated' });
    });
    router.post('/search', jsonParser, async (req, res) => {
        try {
            const { query, limit = 5, options = {} } = req.body;
            if (!query)
                return res.status(400).json({ error: 'Query is required' });
            // Merge defaults with request-specific options
            const activeConfig = { ...defaultConfig, ...options };
            console.log(`[MCPLocalSearch] Received search request: "${query}" (limit: ${limit})`, { options });
            const results = await searchEngine.search({
                query,
                numResults: limit,
                ...options
            });
            res.json(results);
        }
        catch (error) {
            console.error('[MCPLocalSearch] Search error:', error);
            res.status(500).json({ error: error.message });
        }
    });
    router.post('/extract', jsonParser, async (req, res) => {
        try {
            const { url, options = {} } = req.body;
            if (!url)
                return res.status(400).json({ error: 'URL is required' });
            // Merge defaults with request-specific options
            const activeConfig = { ...defaultConfig, ...options };
            console.log(`[MCPLocalSearch] Received extraction request for: ${url}`);
            const content = await contentExtractor.extractContent({
                url,
                ...options
            });
            res.json({ content });
        }
        catch (error) {
            console.error('[MCPLocalSearch] Extraction error:', error);
            res.status(500).json({ error: error.message });
        }
    });
    console.log('[MCPLocalSearch] Plugin endpoints registered successfully.');
}
/**
 * SillyTavern Server Plugin Exit Cleanup
 */
export async function exit() {
    console.log('[MCPLocalSearch] Shutting down SillyTavern MCP Local Search Plugin...');
    if (browserPool) {
        await browserPool.closeAll();
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
    version: '1.2.6',
};

/**
 * Console/Logging Constants
 */
export const LOG_PREFIX = '[MCPLocalSearch]';

/**
 * Quality & Relevance Thresholds
 */
export const QUALITY_THRESHOLD_PERFECT = 0.95;
export const QUALITY_THRESHOLD_EXCELLENT = 0.80;
export const QUALITY_THRESHOLD_GOOD = 0.50;
export const QUALITY_THRESHOLD_MINIMAL = 0.10;

/**
 * Timeout Constants (ms)
 */
export const TIMEOUT_EXTRACTION_DEFAULT = 8000;
export const TIMEOUT_SEARCH_DEFAULT = 10000;
export const TIMEOUT_IDLE_BROWSER = 120000; // 2 minutes

/**
 * Resource Limits
 */
export const MAX_CONCURRENT_EXTRACTIONS = 5;
export const DEFAULT_RESULT_LIMIT = 5;
export const MAX_RESULT_LIMIT = 20;

/**
 * Browser Jitter & Mimicry
 */
export const JITTER_MIN = 500;
export const JITTER_MAX = 1500;
export const CAPTCHA_POLLING_ATTEMPTS = 8;
export const CAPTCHA_POLLING_INTERVAL = 1000;

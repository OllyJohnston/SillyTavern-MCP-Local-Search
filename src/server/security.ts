import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Security Utility for MCP Local Search
 * Handles URL validation and XSS sanitization
 */

// Initialize DOMPurify for Node.js
const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * Validates a URL for security
 * - Must be http or https
 * - Prevents local/private IP ranges (SSRF prevention)
 * - Prevents malformed URLs
 */
export function isValidUrl(url: string | undefined): boolean {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    
    // Protocol check
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.warn(`[Security] Rejected URL protocol: ${parsed.protocol}`);
      return false;
    }
    
    const hostname = parsed.hostname.toLowerCase();
    
    // Prevent local access
    // Note: parsed.hostname for [::1] returns ::1 (without brackets)
    const localHostnames = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (localHostnames.includes(hostname) || hostname === '[::1]') {
      console.warn(`[Security] Rejected local hostname: ${hostname}`);
      return false;
    }
    
    // Basic private IP range check (SSRF prevention)
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    const isPrivateIp = /^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\./.test(hostname);
    if (isPrivateIp) {
      console.warn(`[Security] Rejected private IP range: ${hostname}`);
      return false;
    }
    
    return true;
  } catch (_e) {
    console.warn(`[Security] Malformed URL rejected: ${url}`);
    return false;
  }
}

/**
 * Sanitizes extracted content to prevent XSS
 * Uses DOMPurify to strip dangerous elements and attributes
 */
export function sanitizeContent(content: string): string {
  if (!content) return '';
  
  // DOMPurify is battle-tested against XSS
  return purify.sanitize(content, {
    ALLOWED_TAGS: [], // Strip all HTML tags, we only want plain text
    KEEP_CONTENT: true, // Keep the text inside the tags
  }).trim();
}

/**
 * Escapes characters for safe return to AI/SillyTavern
 */
export function escapeJson(text: string): string {
  return text
    .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

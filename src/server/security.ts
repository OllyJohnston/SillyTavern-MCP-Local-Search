import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import * as dns from 'dns/promises';
import { isIP } from 'net';

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
    return false;
  }
}

/**
 * Perform a deep safety check (async)
 * Includes DNS resolution to prevent SSRF via private IP ranges
 * Also checks against allowlists and blocklists if provided
 */
export async function validateUrlSafety(url: string, allowed: string[] = [], blocked: string[] = []): Promise<boolean> {
  if (!isValidUrl(url)) return false;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // 1. Blocklist check (Explicitly denied)
    if (blocked.length > 0 && isDomainMatch(hostname, blocked)) {
      return false;
    }

    // 2. Allowlist check (Only if provided)
    if (allowed.length > 0 && !isDomainMatch(hostname, allowed)) {
      return false;
    }

    // 3. Resolve DNS
    const lookup = await dns.lookup(hostname);
    const ip = lookup.address;

    // 2. Check if IP is private/local
    if (isPrivateIp(ip)) {
      return false;
    }

    return true;
  } catch (error) {
    // If DNS resolution fails, reject to be safe
    return false;
  }
}

/**
 * Checks if an IP address is within a private or restricted range
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 Private Ranges (RFC 1918)
  // 10.0.0.0/8
  // 172.16.0.0/12
  // 192.168.0.0/16
  // 127.0.0.0/8 (Loopback)
  // 169.254.0.0/16 (Link-local)

  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 0) return true; // Broadcast
  }

  if (isIP(ip) === 6) {
    // IPv6 Private/Local
    // ::1 (Loopback)
    // fe80::/10 (Link-local)
    // fc00::/7 (Unique local)
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
    if (ip.toLowerCase().startsWith('fe80:')) return true;
    if (ip.toLowerCase().startsWith('fc00:') || ip.toLowerCase().startsWith('fd00:')) return true;
  }

  return false;
}

/**
 * Checks if a hostname matches any entry in a list (supports subdomains)
 */
function isDomainMatch(hostname: string, list: string[]): boolean {
  return list.some((domain) => {
    const target = domain.toLowerCase();
    return hostname === target || hostname.endsWith(`.${target}`);
  });
}

/**
 * Sanitizes extracted content to prevent XSS
 * Uses DOMPurify to strip dangerous elements and attributes
 */
export function sanitizeContent(content: string): string {
  if (!content) return '';

  // DOMPurify is battle-tested against XSS
  return purify
    .sanitize(content, {
      ALLOWED_TAGS: [], // Strip all HTML tags, we only want plain text
      KEEP_CONTENT: true, // Keep the text inside the tags
    })
    .trim();
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

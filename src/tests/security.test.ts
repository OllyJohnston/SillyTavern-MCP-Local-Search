import { describe, it, expect } from 'vitest';
import { isValidUrl, sanitizeContent } from '../server/security.js';

describe('Security Utilities', () => {
  describe('isValidUrl', () => {
    it('should return true for valid public https URLs', () => {
      expect(isValidUrl('https://www.google.com')).toBe(true);
      expect(isValidUrl('https://en.wikipedia.org/wiki/Main_Page')).toBe(true);
    });

    it('should return true for valid public http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('should return false for local hostnames (SSRF prevention)', () => {
      expect(isValidUrl('http://localhost:8080')).toBe(false);
      expect(isValidUrl('http://127.0.0.1')).toBe(false);
      expect(isValidUrl('http://0.0.0.0')).toBe(false);
      expect(isValidUrl('http://[::1]')).toBe(false);
    });

    it('should return false for private IP ranges (SSRF prevention)', () => {
      expect(isValidUrl('http://192.168.1.1')).toBe(false);
      expect(isValidUrl('http://10.0.0.5')).toBe(false);
      expect(isValidUrl('http://172.16.0.100')).toBe(false);
    });

    it('should return false for non-http/https protocols', () => {
      expect(isValidUrl('file:///etc/passwd')).toBe(false);
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });

    it('should return false for malformed URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
      expect(isValidUrl(undefined)).toBe(false);
    });
  });

  describe('sanitizeContent', () => {
    it('should strip HTML tags while keeping content', () => {
      const dirty = '<div>Hello <b>World</b></div>';
      expect(sanitizeContent(dirty)).toBe('Hello World');
    });

    it('should remove script tags and their content', () => {
      const dirty = '<div>Safe<script>alert("XSS")</script></div>';
      // DOMPurify with ALLOWED_TAGS: [] strips the tags and script content depending on config, 
      // but by default it strips the script tag itself.
      expect(sanitizeContent(dirty)).toBe('Safe');
    });

    it('should handle dangerous attributes', () => {
      const dirty = '<img src="x" onerror="alert(1)">';
      expect(sanitizeContent(dirty)).toBe('');
    });

    it('should handle null/empty input', () => {
      expect(sanitizeContent('')).toBe('');
      // @ts-ignore
      expect(sanitizeContent(null)).toBe('');
    });
  });
});

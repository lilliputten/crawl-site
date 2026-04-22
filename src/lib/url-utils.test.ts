// src/lib/url-utils.test.ts

import { decodeUrl, normalizeUrl, isValidUrl, urlToFilePath, getDomain, isSameDomain } from './url-utils';
import * as path from 'path';

describe('URL Utils', () => {
  describe('decodeUrl', () => {
    test('should decode URL-encoded Cyrillic characters', () => {
      const encoded = 'http://example.com/%D1%82%D0%B5%D1%81%D1%82';
      const decoded = decodeUrl(encoded);
      expect(decoded).toContain('тест');
    });

    test('should handle already decoded URLs', () => {
      const url = 'http://example.com/test';
      expect(decodeUrl(url)).toBe(url);
    });

    test('should handle invalid URLs gracefully', () => {
      const invalid = 'not-a-valid-url';
      expect(decodeUrl(invalid)).toBe(invalid);
    });

    test('should preserve query parameters and hash', () => {
      const url = 'http://example.com/page?query=test#section';
      expect(decodeUrl(url)).toBe(url);
    });
  });

  describe('normalizeUrl', () => {
    test('should remove trailing slashes except for root', () => {
      expect(normalizeUrl('http://example.com/tags/')).toBe('http://example.com/tags');
      expect(normalizeUrl('http://example.com/')).toBe('http://example.com/');
    });

    test('should clean up double slashes in pathname', () => {
      expect(normalizeUrl('http://example.com/tags//')).toBe('http://example.com/tags');
      expect(normalizeUrl('http://example.com/path//to///page')).toBe('http://example.com/path/to/page');
    });

    test('should preserve protocol and host', () => {
      const url = 'https://example.com:8080/page';
      expect(normalizeUrl(url)).toBe(url);
    });

    test('should handle invalid URLs gracefully', () => {
      const invalid = 'not-a-valid-url';
      expect(normalizeUrl(invalid)).toBe(invalid);
    });
  });

  describe('isValidUrl', () => {
    test('should return true for valid URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('https://example.com/page')).toBe(true);
    });

    test('should return false for invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('urlToFilePath', () => {
    test('should convert URL to file path with index.html for directories', () => {
      const result = urlToFilePath('http://example.com/', 'http://example.com', '/dest');
      expect(result).toBe(path.join('/dest', 'example.com', 'index.html'));
    });

    test('should add .html extension for pages without extension', () => {
      const result = urlToFilePath('http://example.com/page', 'http://example.com', '/dest');
      expect(result).toBe(path.join('/dest', 'example.com', 'page.html'));
    });

    test('should preserve directory structure', () => {
      const result = urlToFilePath('http://example.com/tags/react', 'http://example.com', '/dest');
      expect(result).toBe(path.join('/dest', 'example.com', 'tags', 'react.html'));
    });

    test('should handle trailing slashes by adding index.html', () => {
      const result = urlToFilePath('http://example.com/tags/', 'http://example.com', '/dest');
      expect(result).toBe(path.join('/dest', 'example.com', 'tags', 'index.html'));
    });

    test('should decode Cyrillic characters in path', () => {
      const result = urlToFilePath('http://example.com/%D1%82%D0%B5%D1%81%D1%82', 'http://example.com', '/dest');
      expect(result).toContain('тест.html');
    });
  });

  describe('getDomain', () => {
    test('should extract domain from URL', () => {
      expect(getDomain('http://example.com/page')).toBe('example.com');
      expect(getDomain('https://sub.example.com:8080/page')).toBe('sub.example.com');
    });

    test('should return empty string for invalid URLs', () => {
      expect(getDomain('not-a-url')).toBe('');
    });
  });

  describe('isSameDomain', () => {
    test('should return true for same domain', () => {
      expect(isSameDomain('http://example.com/page1', 'http://example.com/page2')).toBe(true);
    });

    test('should return false for different domains', () => {
      expect(isSameDomain('http://example.com/page', 'http://other.com/page')).toBe(false);
    });

    test('should return false for invalid URLs', () => {
      expect(isSameDomain('not-a-url', 'http://example.com')).toBe(false);
      expect(isSameDomain('http://example.com', 'not-a-url')).toBe(false);
    });
  });
});

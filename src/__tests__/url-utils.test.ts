import { decodeUrl, normalizeUrl } from '@/lib/url-utils';
import { DelayManager } from '@/lib/delay-manager';
import { CrawlConfig } from '@/types';

describe('URL Utils', () => {
  describe('decodeUrl', () => {
    it('should decode Cyrillic URLs', () => {
      const encoded = 'https://example.com/%D1%83%D1%81%D0%BB%D1%83%D0%B3%D0%B8/';
      const decoded = decodeUrl(encoded);
      expect(decoded).toContain('услуги');
    });

    it('should handle already decoded URLs', () => {
      const url = 'https://example.com/services/';
      const decoded = decodeUrl(url);
      expect(decoded).toBe(url);
    });
  });

  describe('normalizeUrl', () => {
    it('should remove trailing slashes', () => {
      const url = 'https://example.com/page/';
      const normalized = normalizeUrl(url);
      expect(normalized).toBe('https://example.com/page');
    });

    it('should keep root slash', () => {
      const url = 'https://example.com/';
      const normalized = normalizeUrl(url);
      expect(normalized).toBe('https://example.com/');
    });
  });
});

describe('DelayManager', () => {
  const mockConfig: CrawlConfig = {
    siteUrl: 'https://example.com',
    sitemapUrls: [],
    crawlDelay: 1000,
    maxRetries: 3,
    retryDelayBase: 2000,
    requestTimeout: 30000,
    dest: './test-dest',
    stateDir: './test-state',
    userAgent: 'TestBot',
    respectRobotsTxt: false,
    maxPages: 0,
    logLevel: 'error',
  };

  it('should start with base delay', () => {
    const manager = new DelayManager(mockConfig);
    expect(manager.getCurrentDelay()).toBe(1000);
  });

  it('should increase delay on error', () => {
    const manager = new DelayManager(mockConfig);
    manager.recordError();
    expect(manager.getCurrentDelay()).toBe(2000);

    manager.recordError();
    expect(manager.getCurrentDelay()).toBe(4000);
  });

  it('should reset delay on success', () => {
    const manager = new DelayManager(mockConfig);
    manager.recordError();
    manager.recordError();
    manager.recordSuccess();
    expect(manager.getCurrentDelay()).toBe(1000);
  });

  it('should calculate retry delays correctly', () => {
    const manager = new DelayManager(mockConfig);
    expect(manager.getRetryDelay(0)).toBe(2000);
    expect(manager.getRetryDelay(1)).toBe(4000);
    expect(manager.getRetryDelay(2)).toBe(8000);
  });
});

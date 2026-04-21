import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import minimist from 'minimist';
import { CrawlerConfig } from '@/types';

export function loadConfig(): CrawlerConfig {
  // Load .env file
  dotenv.config();

  // Load .env.local if it exists (overrides .env)
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    dotenv.config({ path: envLocalPath, override: true });
  }

  // Parse command line arguments
  const argv = minimist(process.argv.slice(2));

  // Helper to get value with priority: CLI > env > default
  const getValue = (key: string, defaultValue: any): any => {
    // Convert kebab-case to camelCase for CLI args
    const camelKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

    // Check CLI first
    if (argv[camelKey] !== undefined && argv[camelKey] !== '') {
      return argv[camelKey];
    }
    if (argv[key] !== undefined && argv[key] !== '') {
      return argv[key];
    }

    // Then environment
    const envValue = process.env[key.toUpperCase()];
    if (envValue !== undefined && envValue !== '') {
      return envValue;
    }

    // Return default
    return defaultValue;
  };

  // Parse sitemap URLs (can be JSON array or comma-separated string)
  const parseSitemapUrls = (value: any): string[] => {
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [value];
      } catch {
        return value
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s);
      }
    }
    return [];
  };

  const siteUrl = getValue('site-url', 'https://example.com');
  const sitemapUrlsRaw = getValue('sitemap-urls', '[]');
  const crawlDelay = Number(getValue('crawl-delay', 1000));
  const maxRetries = Number(getValue('max-retries', 3));
  const retryDelayBase = Number(getValue('retry-delay-base', 2000));
  const requestTimeout = Number(getValue('request-timeout', 30000));
  const dest = getValue('dest', './dest');
  const stateDir = getValue('state-dir', './crawl-data');
  const userAgent = getValue('user-agent', 'Mozilla/5.0 (compatible; CrawlSiteBot/1.0)');
  const respectRobotsTxt = getValue('respect-robots-txt', false);
  const maxPages = Number(getValue('max-pages', 0));
  const logLevel = getValue('log-level', 'info');

  const sitemapUrls = parseSitemapUrls(sitemapUrlsRaw);

  return {
    siteUrl,
    sitemapUrls,
    crawlDelay,
    maxRetries,
    retryDelayBase,
    requestTimeout,
    dest,
    stateDir,
    userAgent,
    respectRobotsTxt,
    maxPages,
    logLevel,
  };
}

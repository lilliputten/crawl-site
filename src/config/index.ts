// src/config/index.ts

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { CrawlConfig } from '@/types';

// Load .env files
const envFile = path.resolve(process.cwd(), '.env');
const envLocalFile = path.resolve(process.cwd(), '.env.local');

if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

if (fs.existsSync(envLocalFile)) {
  dotenv.config({ path: envLocalFile, override: true });
}

export function parseCommandLineArgs(): Partial<CrawlConfig> {
  const args = process.argv.slice(2);
  const config: Partial<CrawlConfig> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--site-url=')) {
      config.siteUrl = arg.split('=')[1];
    } else if (arg.startsWith('--sitemap-urls=')) {
      config.sitemapUrls = JSON.parse(arg.split('=')[1]);
    } else if (arg.startsWith('--crawl-delay=')) {
      config.crawlDelay = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-retries=')) {
      config.maxRetries = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--retry-delay-base=')) {
      config.retryDelayBase = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--request-timeout=')) {
      config.requestTimeout = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--dest=')) {
      config.dest = arg.split('=')[1];
    } else if (arg.startsWith('--state-dir=')) {
      config.stateDir = arg.split('=')[1];
    } else if (arg.startsWith('--user-agent=')) {
      config.userAgent = arg.split('=')[1];
    } else if (arg.startsWith('--respect-robots-txt=')) {
      config.respectRobotsTxt = arg.split('=')[1] === 'true';
    } else if (arg.startsWith('--max-pages=')) {
      config.maxPages = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--log-level=')) {
      config.logLevel = arg.split('=')[1] as CrawlConfig['logLevel'];
    }
  }

  return config;
}

export function loadConfig(): CrawlConfig {
  const envConfig: Partial<CrawlConfig> = {
    siteUrl: process.env.SITE_URL || '',
    sitemapUrls: process.env.SITEMAP_URLS ? JSON.parse(process.env.SITEMAP_URLS) : [],
    crawlDelay: parseInt(process.env.CRAWL_DELAY || '1000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelayBase: parseInt(process.env.RETRY_DELAY_BASE || '2000', 10),
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
    dest: process.env.DEST || './crawled-content',
    stateDir: process.env.STATE_DIR || './crawl-data',
    userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (compatible; CrawlSiteBot/0.1)',
    respectRobotsTxt: process.env.RESPECT_ROBOTS_TXT === 'true',
    maxPages: parseInt(process.env.MAX_PAGES || '0', 10),
    logLevel: (process.env.LOG_LEVEL as CrawlConfig['logLevel']) || 'info',
  };

  // Override with command line arguments
  const cliConfig = parseCommandLineArgs();

  const finalConfig = { ...envConfig, ...cliConfig } as CrawlConfig;

  // Validate required fields
  if (!finalConfig.siteUrl) {
    throw new Error('SITE_URL is required. Set it in .env or use --site-url=...');
  }

  return finalConfig;
}

export function validateConfig(config: CrawlConfig): void {
  if (!config.siteUrl) {
    throw new Error('siteUrl is required');
  }

  try {
    new URL(config.siteUrl);
  } catch (error) {
    throw new Error(`Invalid siteUrl: ${config.siteUrl}`);
  }

  if (config.crawlDelay < 0) {
    throw new Error('crawlDelay must be positive');
  }

  if (config.maxRetries < 0) {
    throw new Error('maxRetries must be non-negative');
  }
}

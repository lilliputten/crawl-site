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
    } else if (arg.startsWith('--use-browser-headers=')) {
      config.useBrowserHeaders = arg.split('=')[1] === 'true';
    } else if (arg.startsWith('--exclude=')) {
      config.exclude = JSON.parse(arg.split('=')[1]);
    }
  }

  return config;
}

/**
 * Load exclusion rules from YAML files
 * Priority: exclude.local.yaml > exclude.yaml > env config
 */
async function loadExcludeRules(): Promise<Array<{ mode: string; string: string }>> {
  const yaml = await import('js-yaml');
  const fs = await import('fs');
  const path = await import('path');

  const rules: Array<{ mode: string; string: string }> = [];

  // Try to load exclude.yaml (project-level rules)
  const excludeYamlPath = path.join(process.cwd(), 'exclude.yaml');
  try {
    if (fs.existsSync(excludeYamlPath)) {
      const fileContents = fs.readFileSync(excludeYamlPath, 'utf8');
      const loadedRules = yaml.load(fileContents) as Array<{ mode: string; string: string }>;
      if (Array.isArray(loadedRules)) {
        rules.push(...loadedRules);
        console.log(`Loaded ${loadedRules.length} exclusion rules from exclude.yaml`);
      }
    }
  } catch (error) {
    console.warn(
      `Warning: Failed to load exclude.yaml: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Try to load exclude.local.yaml (local overrides, higher priority)
  const excludeLocalPath = path.join(process.cwd(), 'exclude.local.yaml');
  try {
    if (fs.existsSync(excludeLocalPath)) {
      const fileContents = fs.readFileSync(excludeLocalPath, 'utf8');
      const loadedRules = yaml.load(fileContents) as Array<{ mode: string; string: string }>;
      if (Array.isArray(loadedRules)) {
        rules.push(...loadedRules);
        console.log(`Loaded ${loadedRules.length} exclusion rules from exclude.local.yaml`);
      }
    }
  } catch (error) {
    console.warn(
      `Warning: Failed to load exclude.local.yaml: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return rules;
}

export async function loadConfig(): Promise<CrawlConfig> {
  const envConfig: Partial<CrawlConfig> = {
    siteUrl: process.env.SITE_URL || '',
    sitemapUrls: process.env.SITEMAP_URLS ? JSON.parse(process.env.SITEMAP_URLS) : [],
    crawlDelay: parseInt(process.env.CRAWL_DELAY || '1000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    retryDelayBase: parseInt(process.env.RETRY_DELAY_BASE || '2000', 10),
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
    dest: process.env.DEST || './crawled-content',
    stateDir: process.env.STATE_DIR || './crawl-data',
    userAgent:
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    respectRobotsTxt: process.env.RESPECT_ROBOTS_TXT === 'true',
    maxPages: parseInt(process.env.MAX_PAGES || '0', 10),
    logLevel: (process.env.LOG_LEVEL as CrawlConfig['logLevel']) || 'info',
    useBrowserHeaders: process.env.USE_BROWSER_HEADERS === 'true',
    exclude: process.env.EXCLUDE_RULES ? JSON.parse(process.env.EXCLUDE_RULES) : [],
  };

  // Override with command line arguments
  const cliConfig = parseCommandLineArgs();

  // Load exclusion rules from YAML files
  const yamlRules = await loadExcludeRules();

  // Merge exclude rules: env config < CLI args < YAML files
  const mergedExclude = [...(envConfig.exclude || []), ...(cliConfig.exclude || []), ...yamlRules];

  const finalConfig = { ...envConfig, ...cliConfig, exclude: mergedExclude } as CrawlConfig;

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

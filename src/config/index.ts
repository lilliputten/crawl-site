// src/config/index.ts

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import minimist from 'minimist';
import { CrawlConfig, ExcludeRule } from '@/types';

// Load .env files
const envFile = path.resolve(process.cwd(), '.env');
const envLocalFile = path.resolve(process.cwd(), '.env.local');

if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

if (fs.existsSync(envLocalFile)) {
  dotenv.config({ path: envLocalFile, override: true });
}

/**
 * Parse command line arguments using minimist for better handling
 */
export function parseCommandLineArgs(): Partial<CrawlConfig> {
  const argv = minimist(process.argv.slice(2));
  const config: Partial<CrawlConfig> = {};

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
    const envKey = key.toUpperCase().replace(/-/g, '_');
    const envValue = process.env[envKey];
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

  config.siteUrl = getValue('site-url', undefined);
  const sitemapUrlsRaw = getValue('sitemap-urls', undefined);
  config.sitemapUrls = sitemapUrlsRaw !== undefined ? parseSitemapUrls(sitemapUrlsRaw) : undefined;
  config.crawlDelay =
    getValue('crawl-delay', undefined) !== undefined
      ? Number(getValue('crawl-delay', undefined))
      : undefined;
  config.maxRetries =
    getValue('max-retries', undefined) !== undefined
      ? Number(getValue('max-retries', undefined))
      : undefined;
  config.retryDelayBase =
    getValue('retry-delay-base', undefined) !== undefined
      ? Number(getValue('retry-delay-base', undefined))
      : undefined;
  config.requestTimeout =
    getValue('request-timeout', undefined) !== undefined
      ? Number(getValue('request-timeout', undefined))
      : undefined;
  config.dest = getValue('dest', undefined);
  config.stateDir = getValue('state-dir', undefined);
  config.userAgent = getValue('user-agent', undefined);

  const respectRobotsTxtRaw = getValue('respect-robots-txt', undefined);
  config.respectRobotsTxt =
    respectRobotsTxtRaw !== undefined
      ? typeof respectRobotsTxtRaw === 'string'
        ? respectRobotsTxtRaw.toLowerCase() === 'true'
        : Boolean(respectRobotsTxtRaw)
      : undefined;

  config.maxPages =
    getValue('max-pages', undefined) !== undefined
      ? Number(getValue('max-pages', undefined))
      : undefined;
  config.logLevel = getValue('log-level', undefined) as CrawlConfig['logLevel'];

  const useBrowserHeadersRaw = getValue('use-browser-headers', undefined);
  config.useBrowserHeaders =
    useBrowserHeadersRaw !== undefined
      ? typeof useBrowserHeadersRaw === 'string'
        ? useBrowserHeadersRaw.toLowerCase() === 'true'
        : Boolean(useBrowserHeadersRaw)
      : undefined;

  // Parse showExclusionMessages
  const showExclusionMessagesRaw = getValue('show-exclusion-messages', undefined);
  config.showExclusionMessages =
    showExclusionMessagesRaw !== undefined
      ? typeof showExclusionMessagesRaw === 'string'
        ? showExclusionMessagesRaw.toLowerCase() === 'true'
        : Boolean(showExclusionMessagesRaw)
      : undefined;

  // Parse maxTreeDepth
  config.maxTreeDepth =
    getValue('max-tree-depth', undefined) !== undefined
      ? Number(getValue('max-tree-depth', undefined))
      : undefined;

  // Parse noColor
  const noColorRaw = getValue('no-color', undefined);
  config.noColor =
    noColorRaw !== undefined
      ? typeof noColorRaw === 'string'
        ? noColorRaw.toLowerCase() === 'true'
        : Boolean(noColorRaw)
      : undefined;

  // Parse exclude rules from CLI
  try {
    const excludeRaw = getValue('exclude', undefined);
    if (excludeRaw !== undefined) {
      const parsed = typeof excludeRaw === 'string' ? JSON.parse(excludeRaw) : excludeRaw;
      if (Array.isArray(parsed)) {
        config.exclude = parsed as ExcludeRule[];
      }
    }
  } catch (error) {
    console.warn('Warning: Failed to parse CLI exclude rules:', error);
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
    dest: process.env.DEST || process.env.STATE_DIR || './crawl-default',
    stateDir: process.env.STATE_DIR || process.env.DEST || './crawl-default',
    userAgent:
      process.env.USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    respectRobotsTxt: process.env.RESPECT_ROBOTS_TXT === 'true',
    maxPages: parseInt(process.env.MAX_PAGES || '0', 10),
    logLevel: (process.env.LOG_LEVEL as CrawlConfig['logLevel']) || 'info',
    useBrowserHeaders: process.env.USE_BROWSER_HEADERS === 'true',
    exclude: process.env.EXCLUDE_RULES ? JSON.parse(process.env.EXCLUDE_RULES) : [],
    noColor: process.env.NO_COLOR === 'true' || process.env.NO_COLOR === '1',
  };

  // Override with command line arguments
  const cliConfig = parseCommandLineArgs();

  // Remove undefined values from cliConfig
  const filteredCliConfig = Object.fromEntries(
    Object.entries(cliConfig).filter(([_, value]) => value != undefined)
  ) as Partial<CrawlConfig>;

  // Load exclusion rules from YAML files
  const yamlRules = await loadExcludeRules();

  // Merge exclude rules: env config < CLI args < YAML files
  const mergedExclude = [
    ...(envConfig.exclude || []),
    ...(filteredCliConfig.exclude || []),
    ...yamlRules,
  ];

  const finalConfig = { ...envConfig, ...filteredCliConfig, exclude: mergedExclude } as CrawlConfig;

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

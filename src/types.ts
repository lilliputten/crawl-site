export interface CrawlConfig {
  siteUrl: string;
  sitemapUrls: string[];
  crawlDelay: number;
  maxRetries: number;
  retryDelayBase: number;
  requestTimeout: number;
  dest: string;
  stateDir: string;
  userAgent: string;
  respectRobotsTxt: boolean;
  maxPages: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  useBrowserHeaders: boolean; // Impersonate as normal browser
  exclude: ExcludeRule[]; // URL exclusion rules
  showExclusionMessages: boolean; // Show/hide URL exclusion messages (default: false)
  maxTreeDepth: number; // Maximum depth for hierarchical sitemap tree building (default: 5)
  noColor: boolean; // Disable colored console output (default: false)
}

// URL exclusion rule types
export type ExcludeMode = 'prefix' | 'suffix' | 'contains' | 'regex' | 'exact';

export interface ExcludeRule {
  mode: ExcludeMode;
  string: string;
}

// Keep CrawlerConfig as an alias for backward compatibility
export type CrawlerConfig = CrawlConfig;

export interface PageData {
  url: string;
  title: string;
  content?: string;
  lastModified?: Date;
  status?: number;
  error?: string;
}

export interface SiteMap {
  urls: PageData[];
  lastUpdated: Date;
}

export interface ScanResult {
  siteMap: SiteMap;
  internalLinks: string[];
  brokenLinks: string[];
  externalLinks: string[];
}

/**
 * Represents a link relationship between pages
 */
export interface LinkRelation {
  sourceUrl: string; // The page containing the link
  targetUrl: string; // The page being linked to
  linkText?: string; // The text content of the link (if available)
}

export interface CrawlState {
  queued: string[];
  completed: Map<string, PageData>;
  failed: Map<string, string>;
  brokenLinks: string[]; // Internal links that returned errors
  externalLinks: Set<string>; // All external links found
  linkRelations: LinkRelation[]; // Track which pages link to which
  lastProcessed: Date;
  crawledPages: string[]; // URLs of pages that have been successfully crawled and saved
}

export interface RobotsTxt {
  allowed: string[];
  disallowed: string[];
  sitemaps: string[];
}

export interface SitemapEntry {
  url: string;
  title?: string;
  lastModified?: Date;
  priority?: number;
}

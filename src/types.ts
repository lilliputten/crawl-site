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

export interface CrawlState {
  queued: string[];
  completed: Map<string, PageData>;
  failed: Map<string, string>;
  brokenLinks: string[]; // Internal links that returned errors
  externalLinks: Set<string>; // All external links found
  lastProcessed: Date;
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

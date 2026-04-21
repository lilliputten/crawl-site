// src/types/index.ts

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

export interface CrawlState {
  queued: string[];
  completed: Map<string, PageData>;
  failed: Map<string, string>;
  lastProcessed: Date;
}

export interface RobotsTxt {
  allowed: string[];
  disallowed: string[];
  sitemaps: string[];
}

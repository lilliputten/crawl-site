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
  maxDelay: number; // Maximum delay cap for exponential backoff (default: 10000ms)
  timezone?: string; // Timezone for date formatting (from TIMEZONE env var or --timezone CLI arg, e.g., 'Europe/Moscow')
  topReportPagesCount?: number; // Number of top/least linked pages to include in report (default: 50)
  contentTransformRules?: ContentTransformRule[]; // Content transformation rules
}

// URL exclusion rule types
export type ExcludeMode = 'prefix' | 'suffix' | 'contains' | 'regex' | 'exact';

export interface ExcludeRule {
  mode: ExcludeMode;
  string: string;
}

// Content transformation rule types
export interface ContentTransformRule {
  find: string; // String or regex pattern to find
  replace: string; // Replacement string
  flags?: string; // Regex flags (e.g., 'g', 'gi') - only used if find is a regex
  isRegex?: boolean; // Whether find is a regex pattern (default: false)
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
  brokenLinks: BrokenLink[]; // Internal links that returned errors (stored in broken-links.yaml)
  externalLinks: Set<string>; // All external links found (stored in external-links.yaml)
  jsLinks: Set<string>; // JavaScript protocol links (stored in js-links.yaml)
  nonHtmlLinks: Set<string>; // Skipped non-HTML content links (stored in non-html-links.yaml)
  linkRelations: LinkRelation[]; // Track which pages link to which (stored in link-relations.yaml)
  pageTitles: Map<string, string>; // Page titles stored separately (stored in page-titles.yaml)
  lastProcessed: Date;
  crawledPages: string[]; // URLs of pages that have been successfully crawled and saved (stored in completed.yaml)
  redirectedPages: RedirectedPage[]; // Pages that returned redirect status codes (stored in redirected-pages.yaml)
  scanStartTime?: Date; // ISO timestamp of when scan started (for resume capability)
}

/**
 * Represents a page that returned a redirect status code
 */
export interface RedirectedPage {
  url: string; // The original URL that was requested
  statusCode: number; // The redirect status code (301, 302, etc.)
  redirectUrl: string; // The URL it redirects to
  timestamp: Date; // When the redirect was detected
}

/**
 * Represents a broken link with its error status
 */
export interface BrokenLink {
  url: string; // The URL that failed
  statusCode?: number | null; // HTTP status code if available (404, 500, etc.)
  timestamp: Date; // When the failure was detected
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

// src/lib/site-scanner.ts

import axios from 'axios';
import { CrawlConfig, PageData, SiteMap, LinkRelation, BrokenLink, RedirectedPage } from '@/types';
import { parseSitemapUrls, extractTitle } from './sitemap-parser';
import { fetchRobotsTxt, isUrlAllowed } from './robots-parser';
import { DelayManager } from './delay-manager';
import { StateManager } from './state-manager';
import { Logger } from './logger';
import {
  normalizeUrl,
  decodeUrl,
  isSameDomain,
  urlToFilePath,
  isHtmlContent,
  isLikelyNonHtmlResource,
  decodeDomain,
} from './url-utils';
import { formatAxiosError, getHttpStatus } from './error-utils';
import { writeYamlFile, ensureDir } from './file-utils';
import { isUrlExcluded } from './url-excluder';
import { transformContent } from './content-transformer';
import { JSDOM } from 'jsdom';
import * as path from 'path';
import * as fs from 'fs';

const logger = new Logger();

/**
 * Configure the module-level logger with settings from config
 */
export function configureLogger(config: CrawlConfig): void {
  logger.configure({ logLevel: config.logLevel, noColor: config.noColor });
}

/**
 * Build realistic browser headers
 */
function buildBrowserHeaders(userAgent: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  };
}

/**
 * Build minimal headers (default)
 */
function buildMinimalHeaders(userAgent: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
  };
}

/**
 * Escape special characters in URLs for use in markdown link text
 * Markdown treats underscores, asterisks, and brackets as formatting symbols
 * This function escapes them to prevent unintended formatting
 */
function escapeMarkdownText(text: string): string {
  // Only escape characters that have special meaning in markdown link text
  return text
    .replace(/_/g, '\\_') // Underscore (italic/bold)
    .replace(/\*/g, '\\*') // Asterisk (bold/italic)
    .replace(/\[/g, '\\[') // Opening bracket (links)
    .replace(/\]/g, '\\]') // Closing bracket (links)
    .replace(/`/g, '\\`'); // Backtick (inline code)
}

export class SiteScanner {
  private config: CrawlConfig;
  private delayManager: DelayManager;
  private stateManager: StateManager; // Required StateManager for state management
  private visitedUrls: Set<string> = new Set();
  private pages: PageData[] = [];
  private internalLinks: Set<string> = new Set();
  private brokenLinks: Map<string, BrokenLink> = new Map(); // Track broken links with full metadata (keyed by URL)
  private externalLinks: Set<string> = new Set();
  private jsLinks: Set<string> = new Set(); // Track javascript: links
  private nonHtmlLinks: Set<string> = new Set(); // Track skipped non-HTML content links
  private specialLinks: Set<string> = new Set(); // Track special links (#, tel:, mailto:)
  private linkRelations: Array<{ sourceUrl: string; targetUrl: string; linkText?: string }> = [];
  private crawledPages: Set<string> = new Set(); // Track successfully crawled pages
  private redirectedPages: RedirectedPage[] = []; // Track redirected pages
  private retryCounts: Map<string, number> = new Map(); // Track retry attempts per URL
  private excludedUrlsCount: number = 0; // Track excluded URLs count

  // Track changes since last save
  private lastSavedPageCount: number = 0;
  private lastSavedBrokenLinkCount: number = 0;
  private lastSavedRedirectedPageCount: number = 0;
  // private hasChangesSinceLastSave: boolean = false;
  private newlyCrawledPagesCount: number = 0; // Track pages actually crawled from network (not loaded from cache)

  constructor(config: CrawlConfig, delayManager: DelayManager, stateManager: StateManager) {
    this.config = config;
    this.delayManager = delayManager;
    this.stateManager = stateManager;

    // Load all state data from StateManager
    const brokenLinksFromState = this.stateManager.getBrokenLinks();
    this.brokenLinks = new Map(brokenLinksFromState.map((link) => [link.url, link]));
    this.externalLinks = new Set(this.stateManager.getExternalLinks());
    this.jsLinks = new Set(this.stateManager.getJsLinks());
    this.nonHtmlLinks = new Set(this.stateManager.getNonHtmlLinks());
    this.specialLinks = new Set(this.stateManager.getSpecialLinks());
    this.linkRelations = this.stateManager.getLinkRelations();

    // Load crawled pages from completed pages in state
    const completedPages = this.stateManager.getCompletedPages();
    completedPages.forEach((url) => {
      this.crawledPages.add(url);
      // Restore title from page-titles.yaml if available
      const title = this.stateManager.getPageTitle(url) || '';
      this.pages.push({ url, title });
    });

    // Load redirected pages from state
    const savedRedirectedPages = this.stateManager.getRedirectedPages();
    this.redirectedPages = savedRedirectedPages.map((p) => ({
      url: p.url,
      statusCode: p.statusCode,
      timestamp: p.timestamp,
      redirectUrl: p.redirectUrl,
    }));

    logger.info(
      `Loaded state: ${this.crawledPages.size} crawled pages, ${this.brokenLinks.size} broken links, ${this.externalLinks.size} external links, ${this.jsLinks.size} js links, ${this.nonHtmlLinks.size} non-HTML links, ${this.linkRelations.length} link relations, ${this.redirectedPages.length} redirected pages`
    );
  }

  /**
   * Decode URL-encoded characters in href/src attributes within HTML content
   */
  private decodeHtmlUrls(html: string): string {
    try {
      // Match href and src attributes with URL-encoded values
      const urlPattern = /(href|src)\s*=\s*["']([^"']*?)["']/g;

      return html.replace(urlPattern, (match, attr, url) => {
        // Only decode if the URL contains percent-encoded characters
        if (url.includes('%')) {
          try {
            const decodedUrl = decodeUrl(url);
            return `${attr}="${decodedUrl}"`;
          } catch {
            // If decoding fails, keep original
            return match;
          }
        }
        return match;
      });
    } catch (error) {
      logger.warn(
        `Failed to decode URLs in HTML: ${error instanceof Error ? error.message : String(error)}`
      );
      return html; // Return original HTML if decoding fails
    }
  }

  /**
   * Save page content to crawl-default folder
   */
  private async savePageContent(url: string, html: string): Promise<void> {
    try {
      // Decode URL-encoded characters in href/src attributes
      const decodedHtml = this.decodeHtmlUrls(html);

      // Create file path from URL, preserving directory structure
      const filePath = urlToFilePath(url, this.config.siteUrl, this.config.dest);

      // Ensure directory exists and save HTML file
      const dir = path.dirname(filePath);
      await ensureDir(dir);
      await fs.promises.writeFile(filePath, decodedHtml, 'utf-8');

      this.crawledPages.add(url);
      logger.debug(`Saved content for: ${url} -> ${filePath}`);
    } catch (error) {
      logger.error(
        `Failed to save content for ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Remove successfully crawled pages from broken links list
   */
  private updateBrokenLinks(): void {
    const beforeCount = this.brokenLinks.size;

    // Remove pages that have been successfully crawled
    this.brokenLinks.forEach((_, brokenUrl) => {
      if (this.crawledPages.has(brokenUrl)) {
        this.brokenLinks.delete(brokenUrl);
      }
    });

    const removedCount = beforeCount - this.brokenLinks.size;
    if (removedCount > 0) {
      logger.info(`Removed ${removedCount} successfully crawled pages from broken links`);
    }
  }

  /**
   * Save current progress to files (called periodically during scanning)
   */
  private async saveProgress(): Promise<void> {
    // Only save if there are actual changes
    const currentPageCount = this.pages.length;
    const currentBrokenLinkCount = this.brokenLinks.size;
    const currentRedirectedPageCount = this.redirectedPages.length;

    const hasNewPages = currentPageCount > this.lastSavedPageCount;
    const hasNewBrokenLinks = currentBrokenLinkCount > this.lastSavedBrokenLinkCount;
    const hasNewRedirectedPages = currentRedirectedPageCount > this.lastSavedRedirectedPageCount;

    // Skip save if no new data was added
    // For pages: only save if we actually crawled new pages from network (not just loaded from cache)
    const hasNewCrawledPages = hasNewPages && this.newlyCrawledPagesCount > 0;

    if (!hasNewCrawledPages && !hasNewBrokenLinks && !hasNewRedirectedPages) {
      logger.debug(
        'No new pages crawled from network, broken links, or redirects found, skipping save'
      );
      return;
    }

    await ensureDir(this.config.stateDir);

    // Update broken links by removing successfully crawled pages
    this.updateBrokenLinks();

    // Save broken links with status codes
    await this.saveBrokenLinksToFile();

    // Save redirected pages
    await this.saveRedirectedPages();

    // Save completed pages
    await this.saveCompletedPages();

    // Save internal links in YAML format
    if (this.internalLinks.size > 0) {
      const internalLinksPath = path.join(this.config.stateDir, 'internal-links.yaml');
      await writeYamlFile(internalLinksPath, Array.from(this.internalLinks).sort());
      logger.info(
        `Internal links saved to ${internalLinksPath} (${this.internalLinks.size} links)`
      );
    }

    // Save broken links with status codes
    await this.saveBrokenLinksToFile();

    // Save external links
    await this.saveExternalLinksToFile();

    // Save JavaScript links
    await this.saveJsLinksToFile();

    // Save non-HTML links
    await this.saveNonHtmlLinksToFile();

    // Save special links
    await this.saveSpecialLinksToFile();

    // Save partial sitemap in YAML format
    if (this.pages.length > 0) {
      /* // UNUSED: sitemap.yaml
       * const partialSiteMap: SiteMap = {
       *   urls: this.pages,
       *   lastUpdated: new Date(),
       * };
       * const sitemapPath = path.join(this.config.stateDir, 'sitemap.yaml');
       * const data = {
       *   ...partialSiteMap,
       *   urls: partialSiteMap.urls.map((p) => ({
       *     ...p,
       *     lastModified: p.lastModified?.toISOString(),
       *   })),
       *   lastUpdated: partialSiteMap.lastUpdated.toISOString(),
       * };
       * await writeYamlFile(sitemapPath, data);
       */
      logger.debug(`Progress saved: ${this.pages.length} pages scanned`);
    }

    // Save crawl state metadata (without large arrays - those are in separate files)
    const crawlStatePath = path.join(this.config.stateDir, 'crawl-state.yaml');
    const scanStartTime = this.stateManager.getScanStartTime();
    const crawlState = {
      totalPagesScanned: this.pages.length,
      excludedUrlsCount: this.excludedUrlsCount,
      internalLinksCount: this.internalLinks.size,
      brokenLinksCount: this.brokenLinks.size,
      externalLinksCount: this.externalLinks.size,
      jsLinksCount: this.jsLinks.size,
      nonHtmlLinksCount: this.nonHtmlLinks.size,
      specialLinksCount: this.specialLinks.size,
      linkRelationsCount: this.linkRelations.length,
      lastProcessed: new Date().toISOString(),
      scanStartTime: scanStartTime?.toISOString(),
    };
    await writeYamlFile(crawlStatePath, crawlState);
    logger.debug(`Crawl state metadata saved`);

    // Update tracking variables after successful save
    this.lastSavedPageCount = this.pages.length;
    this.lastSavedBrokenLinkCount = this.brokenLinks.size;
    this.lastSavedRedirectedPageCount = this.redirectedPages.length;
    // this.hasChangesSinceLastSave = false;
    this.newlyCrawledPagesCount = 0; // Reset counter after saving
  }

  /**
   * Save redirected pages to file
   */
  private async saveRedirectedPages(): Promise<void> {
    if (this.redirectedPages.length > 0) {
      const redirectedPagesPath = path.join(this.config.stateDir, 'redirected-pages.yaml');
      await writeYamlFile(redirectedPagesPath, this.redirectedPages);
      logger.info(
        `Redirected pages saved to ${redirectedPagesPath} (${this.redirectedPages.length} pages)`
      );
    }
  }

  /**
   * Save completed pages to completed.yaml
   */
  private async saveCompletedPages(): Promise<void> {
    if (this.pages.length > 0) {
      const completedPath = path.join(this.config.stateDir, 'completed.yaml');
      await writeYamlFile(completedPath, this.pages);
      logger.info(`Completed pages saved to ${completedPath} (${this.pages.length} pages)`);
    }
  }

  /**
   * Save broken links with status codes to broken-links.yaml
   */
  private async saveBrokenLinksToFile(): Promise<void> {
    if (this.brokenLinks.size > 0) {
      const brokenLinksPath = path.join(this.config.stateDir, 'broken-links.yaml');

      // Convert Map values to array and sort by URL
      const brokenLinksData = Array.from(this.brokenLinks.values())
        .sort((a, b) => a.url.localeCompare(b.url))
        .map(({ url, statusCode, timestamp }) => ({
          url,
          statusCode: statusCode || null,
          // error: error || undefined,
          timestamp: timestamp.toISOString(),
        }));

      await writeYamlFile(brokenLinksPath, brokenLinksData);
      logger.info(`Broken links saved to ${brokenLinksPath} (${this.brokenLinks.size} links)`);
    }
  }

  /**
   * Save external links to external-links.yaml
   */
  private async saveExternalLinksToFile(): Promise<void> {
    if (this.externalLinks.size > 0) {
      const externalLinksPath = path.join(this.config.stateDir, 'external-links.yaml');
      await writeYamlFile(externalLinksPath, Array.from(this.externalLinks).sort());
      logger.info(
        `External links saved to ${externalLinksPath} (${this.externalLinks.size} links)`
      );
    }
  }

  /**
   * Save JavaScript links to js-links.yaml
   */
  private async saveJsLinksToFile(): Promise<void> {
    if (this.jsLinks.size > 0) {
      const jsLinksPath = path.join(this.config.stateDir, 'js-links.yaml');
      await writeYamlFile(jsLinksPath, Array.from(this.jsLinks).sort());
      logger.info(`JavaScript links saved to ${jsLinksPath} (${this.jsLinks.size} links)`);
    }
  }

  /**
   * Save non-HTML links to non-html-links.yaml
   */
  private async saveNonHtmlLinksToFile(): Promise<void> {
    if (this.nonHtmlLinks.size > 0) {
      const nonHtmlLinksPath = path.join(this.config.stateDir, 'non-html-links.yaml');
      await writeYamlFile(nonHtmlLinksPath, Array.from(this.nonHtmlLinks).sort());
      logger.info(`Non-HTML links saved to ${nonHtmlLinksPath} (${this.nonHtmlLinks.size} links)`);
    }
  }

  /**
   * Save special links to special-links.yaml
   */
  private async saveSpecialLinksToFile(): Promise<void> {
    if (this.specialLinks.size > 0) {
      const specialLinksPath = path.join(this.config.stateDir, 'special-links.yaml');
      await writeYamlFile(specialLinksPath, Array.from(this.specialLinks).sort());
      logger.info(`Special links saved to ${specialLinksPath} (${this.specialLinks.size} links)`);
    }
  }

  /**
   * Build hierarchical sitemap structure from link relations
   * Handles circular links by tracking visited nodes during traversal
   */
  private buildHierarchicalSitemap(): Record<string, any> {
    // Build adjacency list from internal link relations
    const adjacencyList: Record<string, Set<string>> = {};
    const allPages = new Set<string>();

    // Initialize with all pages
    this.pages.forEach((page) => {
      allPages.add(page.url);
      if (!adjacencyList[page.url]) {
        adjacencyList[page.url] = new Set<string>();
      }
    });

    // Add edges from link relations (only internal links, excluding filtered URLs)
    const siteDomain = new URL(this.config.siteUrl).host;
    this.linkRelations.forEach((relation) => {
      // Skip self-references
      if (relation.sourceUrl === relation.targetUrl) {
        return;
      }

      // Skip if target URL should be excluded
      if (isUrlExcluded(relation.targetUrl, this.config.exclude, this.config)) {
        return;
      }

      // Only include internal links
      try {
        const targetDomain = new URL(relation.targetUrl).host;
        if (targetDomain === siteDomain) {
          if (!adjacencyList[relation.sourceUrl]) {
            adjacencyList[relation.sourceUrl] = new Set<string>();
          }
          adjacencyList[relation.sourceUrl].add(relation.targetUrl);
          allPages.add(relation.targetUrl);
        }
      } catch {
        // Skip invalid URLs
      }
    });

    // Build tree structure starting from homepage
    const homepage = this.config.siteUrl.endsWith('/')
      ? this.config.siteUrl
      : this.config.siteUrl + '/';

    const structure: Record<string, any> = {};

    const currentPath: Set<string> = new Set();

    // Recursive function to build tree, with circular link detection
    const buildNode = (url: string, depth: number = 0): any => {
      // Prevent infinite recursion from circular links by checking current path
      if (currentPath.has(url)) {
        // console.log('[site-scanner:buildNode] CIRCULAR DETECTED:', url);
        return { url, circular: true };
      }

      // Limit depth to prevent excessively deep structures (reduced from 10 to 5)
      if (depth > 5) {
        // console.log('[site-scanner:buildNode] DEPTH LIMIT REACHED:', url, 'at depth', depth);
        return { url, truncated: true };
      }

      // Add current URL to the path
      currentPath.add(url);

      const children = adjacencyList[url] ? Array.from(adjacencyList[url]) : [];

      const childNodes = children
        .map((childUrl) => buildNode(childUrl, depth + 1))
        .sort((a, b) => a.url.localeCompare(b.url));

      // Only include children property if there are actual children
      if (childNodes.length > 0) {
        return {
          url,
          children: childNodes,
        };
      } else {
        return { url };
      }
    };

    // Start building from homepage
    structure.root = buildNode(homepage);

    // Add orphaned pages (pages not reachable from homepage)
    const reachablePages = new Set<string>();
    const collectReachable = (node: any) => {
      reachablePages.add(node.url);
      if (node.children) {
        node.children.forEach(collectReachable);
      }
    };
    collectReachable(structure.root);

    const orphans = Array.from(allPages)
      .filter((url) => !reachablePages.has(url))
      .sort();

    if (orphans.length > 0) {
      structure.orphans = orphans.map((url) => ({ url }));
    }

    return structure;
  }

  /**
   * Scan the site and build a complete sitemap with link tracking
   */
  async scan(): Promise<SiteMap> {
    logger.info(`Starting scan of ${this.config.siteUrl}`);

    // Initialize scan start time for this session and save to state
    const scanStartTime = new Date();
    this.stateManager.setScanStartTime(scanStartTime);
    this.stateManager.setLastProcessed(scanStartTime);
    logger.info(`Scan started at: ${scanStartTime.toISOString()}`);

    // Fetch robots.txt if configured
    let robotsTxt = null;
    if (this.config.respectRobotsTxt) {
      robotsTxt = await fetchRobotsTxt(this.config.siteUrl, this.config);
      if (robotsTxt) {
        logger.info(`Found ${robotsTxt.sitemaps.length} sitemaps in robots.txt`);

        // Filter sitemaps to only include those from the same domain
        const siteDomain = new URL(this.config.siteUrl).host;
        const sameDomainSitemaps = robotsTxt.sitemaps.filter((sitemapUrl) => {
          try {
            const sitemapDomain = new URL(sitemapUrl).host;
            return sitemapDomain === siteDomain;
          } catch {
            logger.warn(`Invalid sitemap URL in robots.txt: ${sitemapUrl}`);
            return false;
          }
        });

        if (sameDomainSitemaps.length < robotsTxt.sitemaps.length) {
          logger.info(
            `Filtered out ${robotsTxt.sitemaps.length - sameDomainSitemaps.length} external sitemap(s)`
          );
        }

        // Add same-domain sitemaps from robots.txt to our list
        this.config.sitemapUrls = [...new Set([...this.config.sitemapUrls, ...sameDomainSitemaps])];
      }
    }

    // Try to parse provided sitemaps
    let sitemapParsed = false;
    if (this.config.sitemapUrls.length > 0) {
      await this.parseSitemaps();
      sitemapParsed = this.pages.length > 0;
    }

    // If no URLs found from sitemaps, discover by crawling
    if (!sitemapParsed) {
      logger.info('No URLs found from sitemaps, will discover URLs by crawling');
      await this.crawlForUrls(this.config.siteUrl);
    }

    // Final save of all data
    try {
      logger.info('Saving final results...');
      this.stateManager.setLastProcessed();
      await this.saveFinalResults();
      logger.info('Final results saved successfully');
    } catch (error) {}

    const siteMap: SiteMap = {
      urls: this.pages,
      lastUpdated: new Date(),
    };

    logger.info(`Scan complete. Found ${this.pages.length} pages`);
    logger.info(`Excluded: ${this.excludedUrlsCount}`);
    logger.info(`Broken: ${this.brokenLinks.size}`);
    logger.info(`Redirected: ${this.redirectedPages.length}`);

    // Update StateManager with all scanner data (for in-memory state)
    this.stateManager.updateFromScanner({
      pages: this.pages,
      brokenLinks: Array.from(this.brokenLinks.values()),
      externalLinks: Array.from(this.externalLinks),
      linkRelations: this.linkRelations,
      crawledPages: Array.from(this.crawledPages),
      redirectedPages: this.redirectedPages,
    });

    // Save all state to disk (data is saved to separate YAML files)
    await this.stateManager.saveState();
    await this.stateManager.saveLinkRelations();
    await this.stateManager.saveRedirectedPages();
    await this.stateManager.saveBrokenLinks();

    return siteMap;
  }

  /**
   * Parse all configured sitemaps
   */
  private async parseSitemaps(): Promise<void> {
    for (const sitemapUrl of this.config.sitemapUrls) {
      try {
        logger.info(`Parsing sitemap: ${sitemapUrl}`);
        const pages = await parseSitemapUrls(sitemapUrl, this.config);

        for (const page of pages) {
          // Check if URL should be excluded FIRST (before checking visitedUrls)
          if (isUrlExcluded(page.url, this.config.exclude, this.config)) {
            this.excludedUrlsCount++;
            continue;
          }

          if (isSameDomain(page.url, this.config.siteUrl) && !this.visitedUrls.has(page.url)) {
            if (!this.config.respectRobotsTxt || isUrlAllowed(page.url, null)) {
              this.pages.push(page);
              this.visitedUrls.add(page.url);
            }
          }
        }

        await this.delayManager.wait();
      } catch (error) {
        logger.warn(`Failed to parse sitemap ${sitemapUrl}: ${formatAxiosError(error)}`);
      }
    }
  }

  /**
   * Check if page content exists on disk (from previous crawl)
   */
  private async pageExistsOnDisk(url: string): Promise<boolean> {
    try {
      const filePath = urlToFilePath(url, this.config.siteUrl, this.config.dest);
      await fs.promises.access(filePath, fs.constants.F_OK);
      // Check if file is not empty
      const stats = await fs.promises.stat(filePath);
      return stats.size > 0;
    } catch {
      return false;
    }
  }

  /**
   * Read page content from disk
   */
  private async readPageFromDisk(url: string): Promise<string | null> {
    try {
      const filePath = urlToFilePath(url, this.config.siteUrl, this.config.dest);
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch (error) {
      logger.debug(
        `Failed to read ${url} from disk: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Crawl site to discover URLs
   */
  private async crawlForUrls(startUrl: string): Promise<void> {
    const queue: string[] = [startUrl];

    let count = /* this.stateManager.getState().completed.size || */ 0;

    while (queue.length > 0) {
      const queueLength = queue.length;
      const url = queue.shift()!;
      const normalized = normalizeUrl(decodeUrl(url));

      // Skip broken links
      if (this.brokenLinks.has(normalized)) {
        continue; // Skip processing this link
      }

      // Check if already visited (using normalized URL for comparison)
      if (this.visitedUrls.has(normalized)) {
        continue;
      }

      // Check if URL should be excluded BEFORE processing (use normalized URL)
      if (isUrlExcluded(normalized, this.config.exclude, this.config)) {
        this.excludedUrlsCount++;
        this.visitedUrls.add(normalized); // Mark as visited to avoid re-queuing
        continue;
      }

      // Check max pages limit
      if (this.config.maxPages > 0 && this.pages.length >= this.config.maxPages) {
        logger.info(`Reached max pages limit (${this.config.maxPages})`);
        break;
      }

      let html: string;
      let title: string;
      let fetchedFromNetwork = false;

      count++;

      try {
        // Check if page already exists on disk from previous crawl
        const pageExists = await this.pageExistsOnDisk(url);

        if (pageExists) {
          // Read from disk instead of fetching
          logger.debug(`Reading cached page from disk: ${url}`);

          const cachedHtml = await this.readPageFromDisk(url);

          if (cachedHtml) {
            html = cachedHtml;
            title = extractTitle(html);
            logger.info(`✓ Loaded from cache (${count}, queued: ${queueLength}): ${url}`);
            // Mark as crawled since file exists
            this.crawledPages.add(normalized);
            // Don't increment newlyCrawledPagesCount - this is from cache
          } else {
            // Failed to read from disk, fetch from network
            throw new Error('Failed to read cached page');
          }
        } else {
          // Loading from network
          logger.info(`Loading (${count}, queued: ${queueLength}): ${url}`);

          // Fetch from network
          fetchedFromNetwork = true;

          // Build headers based on configuration
          const headers = this.config.useBrowserHeaders
            ? buildBrowserHeaders(this.config.userAgent)
            : buildMinimalHeaders(this.config.userAgent);

          // Configure axios to NOT follow redirects automatically so we can detect them
          const response = await axios.get(url, {
            timeout: this.config.requestTimeout,
            headers,
            maxRedirects: 0, // Don't follow redirects
            validateStatus: (status) => status < 500, // Accept all status codes < 500 as valid
          });

          // Check for redirect status codes (3xx)
          if (response.status >= 300 && response.status < 400) {
            const redirectUrl = decodeUrl(response.headers['location']);
            logger.warn(
              `↪ Redirect detected: ${url} -> ${redirectUrl || 'unknown'} (${response.status})`
            );

            // Track the redirect but don't save content
            if (redirectUrl) {
              // Resolve relative redirect URLs
              let absoluteRedirectUrl = redirectUrl;
              try {
                if (!redirectUrl.startsWith('http')) {
                  const baseUrlForResolution = url.endsWith('/') ? url : url + '/';
                  absoluteRedirectUrl = new URL(redirectUrl, baseUrlForResolution).toString();
                }

                // Check if this URL is already in redirectedPages to avoid duplicates
                const existingRedirectIndex = this.redirectedPages.findIndex(
                  (p) => p.url === normalized
                );

                if (existingRedirectIndex !== -1) {
                  // Update existing entry instead of adding duplicate
                  this.redirectedPages[existingRedirectIndex] = {
                    url: normalized,
                    statusCode: response.status,
                    timestamp: new Date(),
                    redirectUrl: decodeUrl(absoluteRedirectUrl),
                  };
                  logger.debug(`Updated existing redirect: ${url}`);
                } else {
                  // Add new redirect entry
                  this.redirectedPages.push({
                    url: normalized,
                    statusCode: response.status,
                    timestamp: new Date(),
                    redirectUrl: decodeUrl(absoluteRedirectUrl),
                  });
                }

                // Mark that we have changes to save
                // this.hasChangesSinceLastSave = true;
                this.newlyCrawledPagesCount++;

                // Save redirected pages immediately to prevent data loss
                await this.saveRedirectedPages();

                // Mark as visited so we don't process again
                this.visitedUrls.add(normalized);

                // If the redirect target is internal and not visited, add it to queue
                if (isSameDomain(absoluteRedirectUrl, this.config.siteUrl)) {
                  const normalizedRedirect = normalizeUrl(decodeUrl(absoluteRedirectUrl));
                  if (
                    !this.visitedUrls.has(normalizedRedirect) &&
                    !isUrlExcluded(normalizedRedirect, this.config.exclude, this.config)
                  ) {
                    queue.push(absoluteRedirectUrl);
                    logger.debug(`Added redirect target to queue: ${absoluteRedirectUrl}`);
                  }
                }
              } catch (error) {
                logger.warn(
                  `Failed to process redirect for ${url}: ${error instanceof Error ? error.message : String(error)}`
                );
              }
            }

            // Skip further processing - don't save content or extract links
            continue;
          }

          // Check for error status codes (4xx and 5xx)
          if (response.status >= 400) {
            logger.error(`✗ HTTP ${response.status} error for ${url}, marking as broken link`);

            // Add to broken links with full metadata
            this.brokenLinks.set(normalized, {
              url: normalized,
              statusCode: response.status,
              // error: `HTTP ${response.status}`,
              timestamp: new Date(),
            });

            // Mark that we have changes to save
            // this.hasChangesSinceLastSave = true;
            this.newlyCrawledPagesCount++;

            // Save broken links immediately
            await this.saveBrokenLinksToFile();

            // Record error for delay management
            this.delayManager.recordError();
            await this.delayManager.wait();

            // Mark as visited so we don't retry
            this.visitedUrls.add(normalized);

            // Skip further processing
            continue;
          }

          // Check Content-Type header to ensure it's HTML
          const contentType = response.headers['content-type'];
          if (!isHtmlContent(contentType ? String(contentType) : undefined)) {
            logger.debug(`Skipping non-HTML content (${contentType}): ${url}`);
            this.nonHtmlLinks.add(normalized); // Track skipped non-HTML links
            this.visitedUrls.add(normalized);
            continue; // Skip this URL and move to next
          }

          html = response.data;

          // Apply content transformations if rules are configured
          if (this.config.contentTransformRules && this.config.contentTransformRules.length > 0) {
            html = transformContent(html, this.config.contentTransformRules);
          }

          title = extractTitle(html);

          // Save page content to crawl-default folder
          await this.savePageContent(url, html);

          // Track that we crawled a new page from network
          this.newlyCrawledPagesCount++;

          // Clear response data to free memory
          response.data = null;
        }

        this.pages.push({
          url: normalized,
          title,
        });

        // Save page title to state manager
        if (title) {
          this.stateManager.setPageTitle(normalized, title);
        }

        // Extract links from the page - pass the ORIGINAL url, not normalized
        const { internal, external } = this.extractLinks(html, url);

        // Clear response data to free memory
        html = '';

        for (const link of internal) {
          // Check if URL should be excluded FIRST (before checking visitedUrls)
          // Normalize the link first to avoid issues with double slashes
          const normalizedLink = normalizeUrl(decodeUrl(link));

          if (isUrlExcluded(normalizedLink, this.config.exclude, this.config)) {
            this.excludedUrlsCount++;
            continue;
          }

          // Skip non-HTML resources based on URL extension
          if (isLikelyNonHtmlResource(link)) {
            logger.debug(`Skipping non-HTML resource: ${link}`);
            continue;
          }

          if (!this.visitedUrls.has(normalizedLink)) {
            if (!this.config.respectRobotsTxt || isUrlAllowed(link, null)) {
              // Add ORIGINAL URL to queue to preserve path structure for URL resolution
              // Use normalized URL only for deduplication
              queue.push(link);
            }
          }
        }

        for (const link of external) {
          this.externalLinks.add(link);
        }

        // Only wait and record success if we fetched from network
        if (fetchedFromNetwork) {
          await this.delayManager.wait();
          this.delayManager.recordSuccess();
        }
        // No delay for cached pages - they're read instantly from disk

        // Save progress periodically (every 10 pages) if there are changes
        if (
          this.newlyCrawledPagesCount &&
          this.newlyCrawledPagesCount % 10 === 0 /* this.hasChangesSinceLastSave && */
        ) {
          await this.saveProgress();
          logger.info(
            `Progress: ${this.pages.length} pages scanned, ${this.brokenLinks.size} broken links found`
          );
        }
        this.visitedUrls.add(normalized);
      } catch (error) {
        logger.error(`Failed to scan ${url}:`, formatAxiosError(error));

        const normalizedUrl = normalizeUrl(decodeUrl(url));
        const currentRetries = this.retryCounts.get(normalizedUrl) || 1;

        // Check if we should retry
        if (currentRetries < this.config.maxRetries) {
          // Increment retry count and re-queue for retry
          this.retryCounts.set(normalizedUrl, currentRetries + 1);
          queue.push(url); // Re-add original URL to queue
          logger.info(`Will retry ${url} (${currentRetries + 1}/${this.config.maxRetries})`);
        } else {
          // Max retries reached, mark as broken
          const statusCode = getHttpStatus(error);

          // Add to broken links with full metadata
          this.brokenLinks.set(normalizedUrl, {
            url: normalizedUrl,
            statusCode: statusCode || undefined,
            // error: formatAxiosError(error),
            timestamp: new Date(),
          });

          // Mark that we have new broken links to save
          // this.hasChangesSinceLastSave = true;
          this.newlyCrawledPagesCount++;
          logger.error(
            `Max retries (${this.config.maxRetries}) reached for ${url}, marking as broken`
          );
          // Save broken links on each error
          await this.saveBrokenLinksToFile();
        }

        this.delayManager.recordError();
        await this.delayManager.wait();
      }
    }
  }

  /**
   * Extract all links from HTML content and categorize them
   */
  private extractLinks(html: string, baseUrl: string): { internal: string[]; external: string[] } {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const internalLinks: string[] = [];
      const externalLinks: string[] = [];
      const normalizedBase = normalizeUrl(decodeUrl(baseUrl));

      const elements = document.querySelectorAll('a[href]');

      elements.forEach((element) => {
        const href = element.getAttribute('href');
        if (href) {
          // Track special links (#, tel:, mailto:) separately
          if (href.startsWith('#') || href.startsWith('tel:') || href.startsWith('mailto:')) {
            this.specialLinks.add(href);
            return;
          }

          // Track javascript: links separately
          if (href.startsWith('javascript:')) {
            this.jsLinks.add(href);
            return;
          }

          try {
            // Handle relative URLs - ensure baseUrl ends with / for proper resolution
            // If baseUrl doesn't end with /, add it temporarily for URL resolution
            const baseUrlForResolution = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
            const fullUrl = new URL(href, baseUrlForResolution).toString();

            // Normalize for tracking/storage only
            const normalized = normalizeUrl(decodeUrl(fullUrl));

            // Skip if this link is already marked as broken
            if (this.brokenLinks.has(normalized)) {
              return; // Skip processing this link
            }

            // Get link text
            const linkText = element.textContent?.trim() || '';

            // Categorize as internal or external using ORIGINAL URL
            if (isSameDomain(normalized, baseUrl)) {
              // Add ORIGINAL URL to queue for fetching (preserves trailing slashes)
              internalLinks.push(normalized);
              // Track normalized version for deduplication
              this.internalLinks.add(normalized);
            } else {
              // Add ORIGINAL URL to queue for fetching (preserves trailing slashes)
              externalLinks.push(normalized);
              // Track normalized version for deduplication
              this.externalLinks.add(normalized);
            }
            // Track link relation with normalized URLs for consistency
            this.linkRelations.push({
              sourceUrl: normalizedBase,
              targetUrl: normalized,
              linkText: linkText || undefined,
            });
          } catch {
            // Skip invalid URLs
          }
        }
      });

      // Clean up DOM to free memory
      dom.window.close();

      return { internal: internalLinks, external: externalLinks };
    } catch (error) {
      logger.error(
        `Failed to extract links: ${error instanceof Error ? error.message : String(error)}`
      );
      return { internal: [], external: [] };
    }
  }

  /**
   * Save final results (sitemap, link reports, link relations) in YAML format
   */
  private async saveFinalResults(): Promise<void> {
    logger.info(`saveFinalResults called: ${this.linkRelations.length} relations`);
    await ensureDir(this.config.stateDir);

    // Update broken links by removing successfully crawled pages
    this.updateBrokenLinks();

    logger.info(`Saving final results: ${this.linkRelations.length} link relations tracked`);
    if (this.excludedUrlsCount > 0) {
      logger.info(
        `Exclusion summary: ${this.excludedUrlsCount} URLs were excluded based on ${this.config.exclude.length} rules`
      );
    }

    // Save sitemap in YAML format
    const siteMap: SiteMap = {
      urls: this.pages,
      lastUpdated: new Date(),
    };

    if (siteMap.urls.length > 0) {
      /* // UNUSED: sitemap.yaml
       * const sitemapPath = path.join(this.config.stateDir, 'sitemap.yaml');
       * const data = {
       *   ...siteMap,
       *   urls: siteMap.urls.map((p) => ({
       *     ...p,
       *     lastModified: p.lastModified?.toISOString(),
       *   })),
       *   lastUpdated: siteMap.lastUpdated.toISOString(),
       * };
       * await writeYamlFile(sitemapPath, data);
       * logger.info(`Sitemap saved to ${sitemapPath} (${siteMap.urls.length} URLs)`);
       */

      // Save hierarchical sitemap structure (without titles, just links)
      try {
        const hierarchicalStructure = this.buildHierarchicalSitemap();
        const hierarchicalSitemapPath = path.join(this.config.stateDir, 'sitemap-structure.yaml');
        await writeYamlFile(hierarchicalSitemapPath, hierarchicalStructure);
        logger.info(`Hierarchical sitemap structure saved to ${hierarchicalSitemapPath}`);
      } catch (error) {
        logger.error(
          `Failed to save hierarchical sitemap: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      logger.info('No URLs to save in sitemap');
    }
    // Save crawl state metadata (without large arrays - those are in separate files)
    const crawlStatePath = path.join(this.config.stateDir, 'crawl-state.yaml');
    const scanStartTime = this.stateManager.getScanStartTime();
    const crawlState = {
      totalPagesScanned: this.pages.length,
      excludedUrlsCount: this.excludedUrlsCount,
      internalLinksCount: this.internalLinks.size,
      brokenLinksCount: this.brokenLinks.size,
      externalLinksCount: this.externalLinks.size,
      jsLinksCount: this.jsLinks.size,
      nonHtmlLinksCount: this.nonHtmlLinks.size,
      specialLinksCount: this.specialLinks.size,
      linkRelationsCount: this.linkRelations.length,
      lastProcessed: new Date().toISOString(),
      scanStartTime: scanStartTime || undefined,
    };
    await writeYamlFile(crawlStatePath, crawlState);
    logger.info(`Crawl state metadata saved`);

    // Save internal links in YAML format
    if (this.internalLinks.size > 0) {
      const internalLinksPath = path.join(this.config.stateDir, 'internal-links.yaml');
      await writeYamlFile(internalLinksPath, Array.from(this.internalLinks).sort());
      logger.info(
        `Internal links saved to ${internalLinksPath} (${this.internalLinks.size} links)`
      );
    }

    await this.saveBrokenLinksToFile();

    // Save external links in YAML format
    if (this.externalLinks.size > 0) {
      const externalLinksPath = path.join(this.config.stateDir, 'external-links.yaml');
      await writeYamlFile(externalLinksPath, Array.from(this.externalLinks).sort());
      logger.info(
        `External links saved to ${externalLinksPath} (${this.externalLinks.size} links)`
      );
    }

    // Save JavaScript links
    await this.saveJsLinksToFile();

    // Save non-HTML links
    await this.saveNonHtmlLinksToFile();

    // Save special links
    await this.saveSpecialLinksToFile();

    // Save redirected pages
    await this.saveRedirectedPages();

    logger.info('About to process link relations...');

    // Save link relations in hierarchical format (excluding self-references)
    logger.info(`Processing ${this.linkRelations.length} link relations...`);

    try {
      if (this.linkRelations.length > 0) {
        const siteDomain = new URL(this.config.siteUrl).host;

        // Separate internal and external relations
        const internalRelations: LinkRelation[] = [];
        const externalRelations: LinkRelation[] = [];

        this.linkRelations.forEach((relation) => {
          // Skip self-referenced links
          if (relation.sourceUrl === relation.targetUrl) {
            return;
          }

          try {
            const targetDomain = new URL(relation.targetUrl).host;
            if (targetDomain === siteDomain) {
              internalRelations.push(relation);
            } else {
              externalRelations.push(relation);
            }
          } catch {
            // Skip invalid URLs
          }
        });

        // Save internal link relations in YAML format
        if (internalRelations.length > 0) {
          const internalPath = path.join(this.config.stateDir, 'internal-link-relations.yaml');
          const hierarchicalInternal: Record<string, string[]> = {};

          internalRelations.forEach((relation) => {
            if (!hierarchicalInternal[relation.targetUrl]) {
              hierarchicalInternal[relation.targetUrl] = [];
            }
            if (!hierarchicalInternal[relation.targetUrl].includes(relation.sourceUrl)) {
              hierarchicalInternal[relation.targetUrl].push(relation.sourceUrl);
            }
          });

          const sortedInternal: Record<string, string[]> = {};
          Object.keys(hierarchicalInternal)
            .sort()
            .forEach((key) => {
              sortedInternal[key] = hierarchicalInternal[key].sort();
            });

          await writeYamlFile(internalPath, sortedInternal);
          logger.info(
            `Internal link relations saved to ${internalPath} (${Object.keys(sortedInternal).length} target URLs)`
          );
        }

        // Save external link relations in YAML format
        if (externalRelations.length > 0) {
          const externalPath = path.join(this.config.stateDir, 'external-link-relations.yaml');
          const hierarchicalExternal: Record<string, string[]> = {};

          externalRelations.forEach((relation) => {
            if (!hierarchicalExternal[relation.targetUrl]) {
              hierarchicalExternal[relation.targetUrl] = [];
            }
            if (!hierarchicalExternal[relation.targetUrl].includes(relation.sourceUrl)) {
              hierarchicalExternal[relation.targetUrl].push(relation.sourceUrl);
            }
          });

          const sortedExternal: Record<string, string[]> = {};
          Object.keys(hierarchicalExternal)
            .sort()
            .forEach((key) => {
              sortedExternal[key] = hierarchicalExternal[key].sort();
            });

          await writeYamlFile(externalPath, sortedExternal);
          logger.info(
            `External link relations saved to ${externalPath} (${Object.keys(sortedExternal).length} target URLs)`
          );
        }
      }
    } catch (error) {
      logger.error(
        `Failed to save link relations: ${error instanceof Error ? error.message : String(error)}`
      );
      if (error instanceof Error && error.stack) {
        logger.error(error.stack);
      }
    }

    // Generate brief report
    await this.generateReport();
  }

  /**
   * Regenerate only the report.md file without modifying any state files
   * This is used by the report command for read-only report generation
   */
  async regenerateReportOnly(): Promise<void> {
    logger.info('Regenerating report only (read-only mode)...');
    // Report will get scanStartTime from StateManager
    await this.generateReport();
    logger.info('Report regenerated successfully');
  }

  /**
   * Format a date with timezone in the format: "2026.04.25 00:47 +0300"
   */
  private formatDateWithTimezone(date: Date): string {
    const timezone = this.config.timezone || undefined;

    try {
      // Get the offset in hours and minutes
      const formatter = new Intl.DateTimeFormat('en-UK', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(date);
      const partValues: Record<string, string> = {};
      parts.forEach((part) => {
        partValues[part.type] = part.value;
      });

      // Calculate timezone offset
      const offsetMinutes = date.getTimezoneOffset();
      const offsetHours = Math.abs(Math.floor(offsetMinutes / 60));
      const offsetMins = Math.abs(offsetMinutes % 60);
      const offsetSign = offsetMinutes <= 0 ? '+' : '-';
      const offsetStr = `${offsetSign}${String(offsetHours).padStart(2, '0')}${String(offsetMins).padStart(2, '0')}`;

      const result = `${partValues.year}.${partValues.month}.${partValues.day} ${partValues.hour}:${partValues.minute}:${partValues.second} ${offsetStr}`;
      return result;
    } catch (error) {
      // Fallback to simple ISO string if formatting fails
      logger.warn(
        `Failed to format date with timezone ${timezone}: ${error instanceof Error ? error.message : String(error)}`
      );
      return date.toISOString().replace('T', ' ').substring(0, 16);
    }
  }

  /**
   * Generate a brief report in Markdown format
   */
  private async generateReport(): Promise<void> {
    try {
      // Use lastProcessed as scan finish time (it's updated when scan completes)
      const lastProcessed = this.stateManager.getState().lastProcessed;
      const rawSiteDomain = new URL(this.config.siteUrl).host;
      const siteDomain = decodeDomain(rawSiteDomain); // Decode punycode domains

      // Get scan start time from StateManager
      const savedStartTime = this.stateManager.getScanStartTime();
      const effectiveStartTime = savedStartTime ? new Date(savedStartTime) : new Date();

      // Format dates with timezone

      const scanStartedStr = this.formatDateWithTimezone(effectiveStartTime);
      const scanFinishedStr = this.formatDateWithTimezone(lastProcessed);

      // Calculate time elapsed
      const elapsedMs = lastProcessed.getTime() - effectiveStartTime.getTime();
      const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60));
      const elapsedMinutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));
      const elapsedSeconds = Math.ceil((elapsedMs % (1000 * 60)) / 1000);

      let timeElapsedStr = '';
      if (elapsedHours > 0) {
        timeElapsedStr = `${elapsedHours}h ${elapsedMinutes}m ${elapsedSeconds}s`;
      } else if (elapsedMinutes > 0) {
        timeElapsedStr = `${elapsedMinutes}m ${elapsedSeconds}s`;
      } else {
        timeElapsedStr = `${elapsedSeconds}s`;
      }

      // Calculate statistics
      const totalPagesScanned = this.pages.length;
      const totalCrawledPages = this.crawledPages.size;
      const totalInternalLinks = this.internalLinks.size;
      const totalBrokenLinks = this.brokenLinks.size;
      const totalExternalLinks = this.externalLinks.size;
      const totalJsLinks = this.jsLinks.size;
      const totalNonHtmlLinks = this.nonHtmlLinks.size;
      const totalSpecialLinks = this.specialLinks.size;
      const totalRedirectedPages = this.redirectedPages.length;
      const totalLinkRelations = this.linkRelations.length;

      // Calculate redirect status code distribution
      const redirectStatusCodes: Record<number, number> = {};
      this.redirectedPages.forEach((page) => {
        redirectStatusCodes[page.statusCode] = (redirectStatusCodes[page.statusCode] || 0) + 1;
      });

      // Calculate most linked pages (configurable capacity)
      const topReportPagesCount = this.config.topReportPagesCount || 50;
      const linkCounts: Record<string, number> = {};
      this.linkRelations.forEach((relation) => {
        if (relation.sourceUrl !== relation.targetUrl) {
          linkCounts[relation.targetUrl] = (linkCounts[relation.targetUrl] || 0) + 1;
        }
      });

      // Sort by link count
      const sortedPages = Object.entries(linkCounts).sort((a, b) => b[1] - a[1]);

      // Get top N most linked pages
      const topLinkedPages = sortedPages.slice(0, topReportPagesCount);

      /* // Get bottom N least linked pages (pages with fewest incoming links)
       * const leastLinkedPages = sortedPages.slice(-topReportPagesCount).reverse();
       */

      // Calculate external domains (decoded)
      const externalDomains: Set<string> = new Set();
      this.externalLinks.forEach((url) => {
        try {
          const rawDomain = new URL(url).host;
          const decodedDomain = decodeDomain(rawDomain);
          externalDomains.add(decodedDomain);
        } catch {
          // Skip invalid URLs
        }
      });

      // Build report content
      const reportLines: string[] = [];

      reportLines.push(`# Site Scan Report`);
      reportLines.push('');
      reportLines.push(`- **Site URL**: ${this.config.siteUrl}`);
      reportLines.push(`- **Scan Started**: ${scanStartedStr}`);
      if (scanFinishedStr) {
        reportLines.push(`- **Scan Finished**: ${scanFinishedStr}`);
      }
      if (timeElapsedStr) {
        reportLines.push(`- **Time Elapsed**: ${timeElapsedStr}`);
      }
      reportLines.push(`- **Domain**: ${siteDomain}`);
      reportLines.push('');
      reportLines.push('---');
      reportLines.push('');

      // Summary Section
      reportLines.push('## Summary');
      reportLines.push('');
      reportLines.push(`- **Total Pages Scanned**: ${totalPagesScanned}`);
      reportLines.push(`- **Pages Successfully Crawled**: ${totalCrawledPages}`);
      reportLines.push(`- **Internal Links Found**: ${totalInternalLinks}`);
      reportLines.push(
        `- **External Links Found**: ${totalExternalLinks} (${externalDomains.size} unique domains)`
      );
      if (totalJsLinks > 0) {
        reportLines.push(`- **JavaScript Links**: ${totalJsLinks}`);
      }
      if (totalNonHtmlLinks > 0) {
        reportLines.push(`- **Non-HTML Links**: ${totalNonHtmlLinks}`);
      }
      if (totalSpecialLinks > 0) {
        reportLines.push(`- **Special Links**: ${totalSpecialLinks} (#, tel:, mailto:)`);
      }
      reportLines.push(`- **Broken Links**: ${totalBrokenLinks}`);
      reportLines.push(`- **Redirected Pages**: ${totalRedirectedPages}`);
      reportLines.push(`- **Total Link Relations**: ${totalLinkRelations}`);
      reportLines.push('');

      // Broken Links Section
      if (totalBrokenLinks > 0) {
        reportLines.push('## Broken Links');
        reportLines.push('');
        reportLines.push('The following internal links returned errors:');
        reportLines.push('');
        Array.from(this.brokenLinks.keys())
          .sort()
          .forEach((url) => {
            const brokenLink = this.brokenLinks.get(url);
            const statusCode = brokenLink?.statusCode;
            const escapedUrl = escapeMarkdownText(url);
            if (statusCode) {
              reportLines.push(`- [${escapedUrl}](${url}) (HTTP ${statusCode})`);
            } else {
              reportLines.push(`- [${escapedUrl}](${url})`);
            }
          });
        reportLines.push('');
      }

      // Redirected Pages Section
      if (totalRedirectedPages > 0) {
        reportLines.push('## Redirected Pages');
        reportLines.push('');
        reportLines.push('Pages that redirect to other URLs:');
        reportLines.push('');

        // Group by status code
        Object.entries(redirectStatusCodes)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .forEach(([code, count]) => {
            reportLines.push(`### ${code} Redirects (${count})`);
            reportLines.push('');
            this.redirectedPages
              .filter((page) => page.statusCode === Number(code))
              .forEach((page) => {
                const escapedUrl = escapeMarkdownText(page.url);
                const escapedRedirectUrl = escapeMarkdownText(page.redirectUrl);
                reportLines.push(
                  `- [${escapedUrl}](${page.url}) → [${escapedRedirectUrl}](${page.redirectUrl})`
                );
              });
            reportLines.push('');
          });
      }

      // Most Linked Pages Section
      if (topLinkedPages.length > 0) {
        reportLines.push(`## Top ${topReportPagesCount} Most Linked Pages`);
        reportLines.push('');
        reportLines.push('Pages with the highest number of incoming links:');
        reportLines.push('');
        reportLines.push('| Rank | URL | Incoming Links |');
        reportLines.push('|------|-----|----------------|');
        topLinkedPages.forEach(([url, count], index) => {
          const escapedUrl = escapeMarkdownText(url);
          reportLines.push(`| ${index + 1} | [${escapedUrl}](${url}) | ${count} |`);
        });
        reportLines.push('');
      }

      /* // UNUSED: Least Linked Pages Section (they all are have 1 referrrer)
       * if (leastLinkedPages.length > 0) {
       *   reportLines.push(`## Top ${topReportPagesCount} Least Linked Pages`);
       *   reportLines.push('');
       *   reportLines.push('Pages with the fewest number of incoming links:');
       *   reportLines.push('');
       *   reportLines.push('| Rank | URL | Incoming Links |');
       *   reportLines.push('|------|-----|----------------|');
       *   leastLinkedPages.forEach(([url, count], index) => {
       *     reportLines.push(`| ${index + 1} | ${url} | ${count} |`);
       *   });
       *   reportLines.push('');
       * }
       */

      // External Domains Section
      if (externalDomains.size > 0) {
        reportLines.push('## External Domains');
        reportLines.push('');
        reportLines.push(`Found links to ${externalDomains.size} unique external domains:`);
        reportLines.push('');
        reportLines.push('| Rank | Links | URL |');
        reportLines.push('|------|-------|-----|');

        // Calculate link counts per domain and sort by count (descending)
        const domainLinkCounts: Array<{ domain: string; count: number }> = [];
        externalDomains.forEach((domain) => {
          const domainLinks = Array.from(this.externalLinks).filter((url) => {
            try {
              const rawDomain = new URL(url).host;
              const decodedDomain = decodeDomain(rawDomain);
              return decodedDomain === domain;
            } catch {
              return false;
            }
          });
          domainLinkCounts.push({ domain, count: domainLinks.length });
        });

        // Sort by link count (descending), then alphabetically for ties
        domainLinkCounts.sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return a.domain.localeCompare(b.domain);
        });

        domainLinkCounts.forEach(({ domain, count }, n) => {
          reportLines.push(
            `| ${n + 1} | ${count} | [${escapeMarkdownText(domain)}](https://${domain}) |`
          );
        });
        reportLines.push('');
      }

      // Configuration Section
      reportLines.push('## Scan Configuration');
      reportLines.push('');
      reportLines.push(`- **Crawl Delay**: ${this.config.crawlDelay}ms`);
      reportLines.push(`- **Max Retries**: ${this.config.maxRetries}`);
      reportLines.push(`- **Request Timeout**: ${this.config.requestTimeout}ms`);
      reportLines.push(`- **Respect robots.txt**: ${this.config.respectRobotsTxt ? 'Yes' : 'No'}`);
      reportLines.push(`- **Exclude Rules**: ${this.config.exclude.length} rules`);
      if (this.excludedUrlsCount > 0) {
        reportLines.push(`- **URLs Excluded**: ${this.excludedUrlsCount}`);
      }
      reportLines.push('');

      // Output Files Section
      reportLines.push('## Generated Files');
      reportLines.push('');
      reportLines.push('The following files were generated in the `crawl-default/` directory:');
      reportLines.push('');
      // reportLines.push('- `sitemap.yaml` - Complete list of discovered URLs');
      reportLines.push('- `sitemap-structure.yaml` - Hierarchical sitemap structure');
      reportLines.push('- `crawl-state.yaml` - Scan state and statistics');
      reportLines.push('- `internal-links.yaml` - All internal links');
      reportLines.push('- `external-links.yaml` - All external links');
      if (totalJsLinks > 0) {
        reportLines.push('- `js-links.yaml` - JavaScript protocol links');
      }
      if (totalNonHtmlLinks > 0) {
        reportLines.push('- `non-html-links.yaml` - Skipped non-HTML content links');
      }
      if (this.specialLinks.size > 0) {
        reportLines.push('- `special-links.yaml` - Special links (#, tel:, mailto:)');
      }
      reportLines.push('- `internal-link-relations.yaml` - Internal link relationships');
      reportLines.push('- `external-link-relations.yaml` - External link relationships');
      if (totalBrokenLinks > 0) {
        reportLines.push('- `broken-links.yaml` - List of broken links');
      }
      if (totalRedirectedPages > 0) {
        reportLines.push('- `redirected-pages.yaml` - List of redirected pages');
      }
      reportLines.push('');
      reportLines.push('Downloaded HTML content is saved in the `crawled-content/` directory.');
      reportLines.push('');

      // Footer
      reportLines.push('---');
      reportLines.push('');
      const reportGeneratedTime = this.formatDateWithTimezone(new Date());
      reportLines.push(`*Report generated on ${reportGeneratedTime}*`);
      reportLines.push('');

      // Write report file
      const reportContent = reportLines.join('\n');
      const reportPath = path.join(this.config.stateDir, 'report.md');
      await fs.promises.writeFile(reportPath, reportContent, 'utf-8');
      logger.info(`Scan report saved to ${reportPath}`);
    } catch (error) {
      logger.error(
        `Failed to generate report: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Public method to gracefully shutdown and save all results
   * This can be called when receiving SIGINT (Ctrl-C) or other termination signals
   */
  async shutdown(): Promise<void> {
    logger.info('Shutdown signal received, saving final results...');
    try {
      // During shutdown, rely on StateManager for scanStartTime
      await this.saveFinalResults();
      logger.info('Final results saved successfully before shutdown');
    } catch (error) {
      logger.error(
        `Failed to save results during shutdown: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

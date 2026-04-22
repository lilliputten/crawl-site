// src/lib/site-scanner.ts

import axios from 'axios';
import { CrawlConfig, PageData, SiteMap, LinkRelation } from '@/types';
import { parseSitemapUrls, extractTitle } from './sitemap-parser';
import { fetchRobotsTxt, isUrlAllowed } from './robots-parser';
import { DelayManager } from './delay-manager';
import { Logger } from './logger';
import { normalizeUrl, decodeUrl, isSameDomain } from './url-utils';
import { formatAxiosError } from './error-utils';
import { writeYamlFile, ensureDir } from './file-utils';
import { isUrlExcluded } from './url-excluder';
import { JSDOM } from 'jsdom';
import * as path from 'path';
import * as fs from 'fs';

const logger = new Logger();

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

export class SiteScanner {
  private config: CrawlConfig;
  private delayManager: DelayManager;
  private visitedUrls: Set<string> = new Set();
  private pages: PageData[] = [];
  private internalLinks: Set<string> = new Set();
  private brokenLinks: Set<string> = new Set();
  private externalLinks: Set<string> = new Set();
  private linkRelations: Array<{ sourceUrl: string; targetUrl: string; linkText?: string }> = [];
  private crawledPages: Set<string> = new Set(); // Track successfully crawled pages
  private retryCounts: Map<string, number> = new Map(); // Track retry attempts per URL

  constructor(config: CrawlConfig, delayManager: DelayManager) {
    this.config = config;
    this.delayManager = delayManager;
  }

  /**
   * Save page content to crawled-content folder
   */
  private async savePageContent(url: string, html: string): Promise<void> {
    try {
      // Create file path from URL, preserving directory structure
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;

      // Remove leading slash
      if (pathname.startsWith('/')) {
        pathname = pathname.substring(1);
      }

      // If pathname is empty or just '/', use index.html
      if (!pathname || pathname === '/') {
        pathname = 'index.html';
      } else if (!pathname.endsWith('.html')) {
        // Add .html extension if not present
        pathname = pathname.endsWith('/') ? pathname + 'index.html' : pathname + '.html';
      }

      // Use config.dest directly (already points to crawled-content folder)
      const filePath = path.join(this.config.dest, pathname);

      // Ensure directory exists and save HTML file
      const dir = path.dirname(filePath);
      await ensureDir(dir);
      await fs.promises.writeFile(filePath, html, 'utf-8');

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
    this.brokenLinks.forEach((brokenUrl) => {
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
    const { ensureDir } = await import('./file-utils');

    await ensureDir(this.config.stateDir);

    // Update broken links by removing successfully crawled pages
    this.updateBrokenLinks();

    // Save partial sitemap in YAML format
    if (this.pages.length > 0) {
      const partialSiteMap: SiteMap = {
        urls: this.pages,
        lastUpdated: new Date(),
      };

      const sitemapPath = path.join(this.config.stateDir, 'sitemap.yaml');
      const data = {
        ...partialSiteMap,
        urls: partialSiteMap.urls.map((p) => ({
          ...p,
          lastModified: p.lastModified?.toISOString(),
        })),
        lastUpdated: partialSiteMap.lastUpdated.toISOString(),
      };

      await writeYamlFile(sitemapPath, data);
      logger.debug(`Progress saved: ${this.pages.length} pages scanned`);
    }

    // Save crawl state with crawled pages info
    const crawlStatePath = path.join(this.config.stateDir, 'crawl-state.yaml');
    const crawlState = {
      totalPagesScanned: this.pages.length,
      crawledPages: Array.from(this.crawledPages).sort(),
      internalLinksCount: this.internalLinks.size,
      brokenLinksCount: this.brokenLinks.size,
      externalLinksCount: this.externalLinks.size,
      linkRelationsCount: this.linkRelations.length,
      lastProcessed: new Date().toISOString(),
    };
    await writeYamlFile(crawlStatePath, crawlState);
    logger.debug(`Crawl state saved: ${this.crawledPages.size} pages crawled`);

    // Save link relations in hierarchical format (excluding self-references)
    try {
      logger.info(`Processing ${this.linkRelations.length} link relations...`);

      if (this.linkRelations.length > 0) {
        const siteDomain = new URL(this.config.siteUrl).host;
        logger.info(`Site domain: ${siteDomain}`);

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
          } catch (error) {
            logger.info(`Invalid URL in relation: ${relation.targetUrl}`);
          }
        });

        logger.info(
          `Separated: ${internalRelations.length} internal, ${externalRelations.length} external`
        );

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

    // Add edges from link relations (only internal links)
    const siteDomain = new URL(this.config.siteUrl).host;
    this.linkRelations.forEach((relation) => {
      // Skip self-references
      if (relation.sourceUrl === relation.targetUrl) {
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

    const visited = new Set<string>();
    const structure: Record<string, any> = {};

    // Recursive function to build tree, with circular link detection
    const buildNode = (url: string, depth: number = 0): any => {
      // Prevent infinite recursion from circular links
      if (visited.has(url)) {
        return { url, circular: true, children: [] };
      }

      // Limit depth to prevent excessively deep structures
      if (depth > 10) {
        return { url, truncated: true, children: [] };
      }

      visited.add(url);

      const children = adjacencyList[url] ? Array.from(adjacencyList[url]) : [];
      const childNodes = children
        .map((childUrl) => buildNode(childUrl, depth + 1))
        .sort((a, b) => a.url.localeCompare(b.url));

      visited.delete(url); // Backtrack for other paths

      return {
        url,
        children: childNodes,
      };
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
      await this.saveFinalResults();
      logger.info('Final results saved successfully');
    } catch (error) {
      logger.error(
        `Failed to save final results: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const siteMap: SiteMap = {
      urls: this.pages,
      lastUpdated: new Date(),
    };

    logger.info(`Scan complete. Found ${this.pages.length} pages`);
    logger.info(
      `Links summary: ${this.internalLinks.size} internal, ${this.brokenLinks.size} broken, ${this.externalLinks.size} external`
    );

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
          if (isSameDomain(page.url, this.config.siteUrl) && !this.visitedUrls.has(page.url)) {
            // Check if URL should be excluded
            if (isUrlExcluded(page.url, this.config.exclude)) {
              logger.debug(`Skipping excluded URL from sitemap: ${page.url}`);
              continue;
            }

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
   * Crawl site to discover URLs
   */
  private async crawlForUrls(startUrl: string): Promise<void> {
    const queue: string[] = [startUrl];

    while (queue.length > 0) {
      const url = queue.shift()!;
      const normalizedUrl = normalizeUrl(decodeUrl(url));

      // Check if already visited (using normalized URL for comparison)
      if (this.visitedUrls.has(normalizedUrl)) {
        continue;
      }

      // Check max pages limit
      if (this.config.maxPages > 0 && this.pages.length >= this.config.maxPages) {
        logger.info(`Reached max pages limit (${this.config.maxPages})`);
        break;
      }

      // Mark as visited using normalized URL
      this.visitedUrls.add(normalizedUrl);
      logger.info(`Scanning (${this.pages.length + 1}): ${url}`);

      try {
        // Build headers based on configuration
        const headers = this.config.useBrowserHeaders
          ? buildBrowserHeaders(this.config.userAgent)
          : buildMinimalHeaders(this.config.userAgent);

        const response = await axios.get(url, {
          timeout: this.config.requestTimeout,
          headers,
        });

        const title = extractTitle(response.data);
        const normalizedUrl = normalizeUrl(decodeUrl(url));

        this.pages.push({
          url: normalizedUrl,
          title,
        });

        // Save page content to crawled-content folder
        await this.savePageContent(url, response.data);

        // Extract links from the page - pass the ORIGINAL url, not normalized
        const { internal, external } = this.extractLinks(response.data, url);

        for (const link of internal) {
          const normalizedLink = normalizeUrl(decodeUrl(link));
          if (!this.visitedUrls.has(normalizedLink)) {
            // Check if URL should be excluded
            if (isUrlExcluded(link, this.config.exclude)) {
              logger.debug(`Skipping excluded URL: ${link}`);
              continue;
            }

            if (!this.config.respectRobotsTxt || isUrlAllowed(link, null)) {
              queue.push(link);
            }
          }
        }

        for (const link of external) {
          this.externalLinks.add(link);
        }

        await this.delayManager.wait();
        this.delayManager.recordSuccess();

        // Save progress periodically (every 10 pages)
        if (this.pages.length % 10 === 0) {
          await this.saveProgress();
          logger.info(
            `Progress: ${this.pages.length} pages scanned, ${this.brokenLinks.size} broken links found`
          );
        }
      } catch (error) {
        logger.warn(`Failed to scan ${url}:`, formatAxiosError(error));

        const normalizedUrl = normalizeUrl(decodeUrl(url));
        const currentRetries = this.retryCounts.get(normalizedUrl) || 0;

        // Check if we should retry
        if (currentRetries < this.config.maxRetries) {
          // Increment retry count and re-queue for retry
          this.retryCounts.set(normalizedUrl, currentRetries + 1);
          queue.push(url); // Re-add original URL to queue
          logger.info(`Will retry ${url} (${currentRetries + 1}/${this.config.maxRetries})`);
        } else {
          // Max retries reached, mark as broken
          this.brokenLinks.add(normalizedUrl);
          logger.warn(
            `Max retries (${this.config.maxRetries}) reached for ${url}, marking as broken`
          );
        }

        this.delayManager.recordError();
        await this.delayManager.wait();

        // Save progress even on errors
        if (this.pages.length % 10 === 0 || this.brokenLinks.size % 5 === 0) {
          await this.saveProgress();
        }
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

      const elements = document.querySelectorAll('a[href]');

      elements.forEach((element) => {
        const href = element.getAttribute('href');
        if (href) {
          try {
            // Handle relative URLs - keep ORIGINAL URL for fetching
            const fullUrl = new URL(href, baseUrl).toString();

            // Get link text
            const linkText = element.textContent?.trim() || '';

            // Normalize for tracking/storage only
            const normalized = normalizeUrl(decodeUrl(fullUrl));
            const normalizedBase = normalizeUrl(decodeUrl(baseUrl));

            // Track link relation with normalized URLs for consistency
            this.linkRelations.push({
              sourceUrl: normalizedBase,
              targetUrl: normalized,
              linkText: linkText || undefined,
            });

            // Categorize as internal or external using ORIGINAL URL
            if (isSameDomain(fullUrl, baseUrl)) {
              // Add ORIGINAL URL to queue for fetching (preserves trailing slashes)
              internalLinks.push(fullUrl);
              // Track normalized version for deduplication
              this.internalLinks.add(normalized);
            } else {
              externalLinks.push(normalized);
              this.externalLinks.add(normalized);
            }
          } catch {
            // Skip invalid URLs
          }
        }
      });

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
    const { ensureDir } = await import('./file-utils');

    logger.info(`saveFinalResults called: ${this.linkRelations.length} relations`);
    await ensureDir(this.config.stateDir);

    // Update broken links by removing successfully crawled pages
    this.updateBrokenLinks();

    logger.debug(`Saving final results: ${this.linkRelations.length} link relations tracked`);

    // Save sitemap in YAML format
    const siteMap: SiteMap = {
      urls: this.pages,
      lastUpdated: new Date(),
    };

    if (siteMap.urls.length > 0) {
      const sitemapPath = path.join(this.config.stateDir, 'sitemap.yaml');
      const data = {
        ...siteMap,
        urls: siteMap.urls.map((p) => ({
          ...p,
          lastModified: p.lastModified?.toISOString(),
        })),
        lastUpdated: siteMap.lastUpdated.toISOString(),
      };

      await writeYamlFile(sitemapPath, data);
      logger.info(`Sitemap saved to ${sitemapPath} (${siteMap.urls.length} URLs)`);

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

    // Save crawl state with detailed info
    const crawlStatePath = path.join(this.config.stateDir, 'crawl-state.yaml');
    const crawlState = {
      totalPagesScanned: this.pages.length,
      crawledPages: Array.from(this.crawledPages).sort(),
      internalLinksCount: this.internalLinks.size,
      brokenLinksCount: this.brokenLinks.size,
      externalLinksCount: this.externalLinks.size,
      linkRelationsCount: this.linkRelations.length,
      lastProcessed: new Date().toISOString(),
    };
    await writeYamlFile(crawlStatePath, crawlState);
    logger.info(`Crawl state saved: ${this.crawledPages.size} pages crawled`);

    // Save internal links in YAML format
    if (this.internalLinks.size > 0) {
      const internalLinksPath = path.join(this.config.stateDir, 'internal-links.yaml');
      await writeYamlFile(internalLinksPath, Array.from(this.internalLinks).sort());
      logger.info(
        `Internal links saved to ${internalLinksPath} (${this.internalLinks.size} links)`
      );
    }

    // Save broken links in YAML format (after removing successfully crawled pages)
    if (this.brokenLinks.size > 0) {
      const brokenLinksPath = path.join(this.config.stateDir, 'broken-links.yaml');
      await writeYamlFile(brokenLinksPath, Array.from(this.brokenLinks).sort());
      logger.warn(`Broken links saved to ${brokenLinksPath} (${this.brokenLinks.size} links)`);
    } else {
      logger.info('No broken links to save (all pages crawled successfully)');
    }

    // Save external links in YAML format
    if (this.externalLinks.size > 0) {
      const externalLinksPath = path.join(this.config.stateDir, 'external-links.yaml');
      await writeYamlFile(externalLinksPath, Array.from(this.externalLinks).sort());
      logger.info(
        `External links saved to ${externalLinksPath} (${this.externalLinks.size} links)`
      );
    }

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
  }
}

// src/lib/site-scanner.ts

import axios from 'axios';
import { CrawlConfig, PageData, SiteMap } from '@/types';
import { parseSitemapUrls, extractTitle } from './sitemap-parser';
import { fetchRobotsTxt, isUrlAllowed } from './robots-parser';
import { DelayManager } from './delay-manager';
import { Logger } from './logger';
import { normalizeUrl, decodeUrl, isSameDomain } from './url-utils';
import { JSDOM } from 'jsdom';

const logger = new Logger();

export class SiteScanner {
  private config: CrawlConfig;
  private delayManager: DelayManager;
  private visitedUrls: Set<string> = new Set();
  private pages: PageData[] = [];
  private internalLinks: Set<string> = new Set();
  private brokenLinks: Set<string> = new Set();
  private externalLinks: Set<string> = new Set();

  constructor(config: CrawlConfig, delayManager: DelayManager) {
    this.config = config;
    this.delayManager = delayManager;
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

    // Save sitemap (only if we have URLs)
    const siteMap: SiteMap = {
      urls: this.pages,
      lastUpdated: new Date(),
    };

    await this.saveSiteMap(siteMap);

    // Save link reports
    await this.saveLinkReports();

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
            if (!this.config.respectRobotsTxt || isUrlAllowed(page.url, null)) {
              this.pages.push(page);
              this.visitedUrls.add(page.url);
            }
          }
        }

        await this.delayManager.wait();
      } catch (error) {
        logger.warn(`Failed to parse sitemap ${sitemapUrl}:`, error);
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

      if (this.visitedUrls.has(url)) {
        continue;
      }

      // Check max pages limit
      if (this.config.maxPages > 0 && this.pages.length >= this.config.maxPages) {
        logger.info(`Reached max pages limit (${this.config.maxPages})`);
        break;
      }

      this.visitedUrls.add(url);
      logger.debug(`Scanning: ${url}`);

      try {
        const response = await axios.get(url, {
          timeout: this.config.requestTimeout,
          headers: {
            'User-Agent': this.config.userAgent,
          },
        });

        const title = extractTitle(response.data);
        const normalizedUrl = normalizeUrl(decodeUrl(url));

        this.pages.push({
          url: normalizedUrl,
          title,
        });

        // Extract links from the page
        const { internal, external } = this.extractLinks(response.data, url);

        for (const link of internal) {
          if (!this.visitedUrls.has(link)) {
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
      } catch (error) {
        logger.warn(`Failed to scan ${url}:`, error);
        // Track as broken link
        const normalizedUrl = normalizeUrl(decodeUrl(url));
        this.brokenLinks.add(normalizedUrl);
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

      const elements = document.querySelectorAll('a[href]');

      elements.forEach((element) => {
        const href = element.getAttribute('href');
        if (href) {
          try {
            // Handle relative URLs
            const fullUrl = new URL(href, baseUrl).toString();
            const normalized = normalizeUrl(decodeUrl(fullUrl));

            // Categorize as internal or external
            if (isSameDomain(fullUrl, baseUrl)) {
              internalLinks.push(normalized);
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
      logger.error('Failed to extract links:', error);
      return { internal: [], external: [] };
    }
  }

  /**
   * Save sitemap to file (only if we have URLs)
   */
  private async saveSiteMap(siteMap: SiteMap): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const { ensureDir } = await import('./file-utils');

    // Only save if we have URLs
    if (siteMap.urls.length === 0) {
      logger.info('No URLs to save in sitemap');
      return;
    }

    // Ensure state directory exists
    await ensureDir(this.config.stateDir);

    const sitemapPath = path.join(this.config.stateDir, 'sitemap.json');
    const data = {
      ...siteMap,
      urls: siteMap.urls.map((p) => ({
        ...p,
        lastModified: p.lastModified?.toISOString(),
      })),
      lastUpdated: siteMap.lastUpdated.toISOString(),
    };

    await fs.promises.writeFile(sitemapPath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Sitemap saved to ${sitemapPath} (${siteMap.urls.length} URLs)`);
  }

  /**
   * Save link reports (internal, broken, external)
   */
  private async saveLinkReports(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const { ensureDir } = await import('./file-utils');

    // Ensure state directory exists
    await ensureDir(this.config.stateDir);

    // Save internal links
    if (this.internalLinks.size > 0) {
      const internalLinksPath = path.join(this.config.stateDir, 'internal-links.json');
      await fs.promises.writeFile(
        internalLinksPath,
        JSON.stringify(Array.from(this.internalLinks).sort(), null, 2),
        'utf-8'
      );
      logger.info(
        `Internal links saved to ${internalLinksPath} (${this.internalLinks.size} links)`
      );
    }

    // Save broken links
    if (this.brokenLinks.size > 0) {
      const brokenLinksPath = path.join(this.config.stateDir, 'broken-links.json');
      await fs.promises.writeFile(
        brokenLinksPath,
        JSON.stringify(Array.from(this.brokenLinks).sort(), null, 2),
        'utf-8'
      );
      logger.warn(`Broken links saved to ${brokenLinksPath} (${this.brokenLinks.size} links)`);
    }

    // Save external links
    if (this.externalLinks.size > 0) {
      const externalLinksPath = path.join(this.config.stateDir, 'external-links.json');
      await fs.promises.writeFile(
        externalLinksPath,
        JSON.stringify(Array.from(this.externalLinks).sort(), null, 2),
        'utf-8'
      );
      logger.info(
        `External links saved to ${externalLinksPath} (${this.externalLinks.size} links)`
      );
    }
  }
}

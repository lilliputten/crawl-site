// src/lib/site-scanner.ts

import axios from 'axios';
import { CrawlConfig, PageData, SiteMap } from '@/types';
import { parseSitemapUrls, extractTitle } from './sitemap-parser';
import { fetchRobotsTxt, isUrlAllowed } from './robots-parser';
import { DelayManager } from './delay-manager';
import { Logger } from './logger';
import { normalizeUrl, decodeUrl, isSameDomain } from './url-utils';
import { formatAxiosError } from './error-utils';
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
  private linkRelations: Array<{ sourceUrl: string; targetUrl: string; linkText?: string }> = [];

  constructor(config: CrawlConfig, delayManager: DelayManager) {
    this.config = config;
    this.delayManager = delayManager;
  }

  /**
   * Save current progress to files (called periodically during scanning)
   */
  private async saveProgress(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const { ensureDir } = await import('./file-utils');

    await ensureDir(this.config.stateDir);

    // Save partial sitemap
    if (this.pages.length > 0) {
      const partialSiteMap: SiteMap = {
        urls: this.pages,
        lastUpdated: new Date(),
      };

      const sitemapPath = path.join(this.config.stateDir, 'sitemap.json');
      const data = {
        ...partialSiteMap,
        urls: partialSiteMap.urls.map((p) => ({
          ...p,
          lastModified: p.lastModified?.toISOString(),
        })),
        lastUpdated: partialSiteMap.lastUpdated.toISOString(),
      };

      await fs.promises.writeFile(sitemapPath, JSON.stringify(data, null, 2), 'utf-8');
      logger.debug(`Progress saved: ${this.pages.length} pages scanned`);
    }

    // Save link relations in hierarchical format (excluding self-references)
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

      // Save internal link relations
      if (internalRelations.length > 0) {
        const internalPath = path.join(this.config.stateDir, 'internal-link-relations.json');
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

        await fs.promises.writeFile(internalPath, JSON.stringify(sortedInternal, null, 2), 'utf-8');
        logger.info(
          `Internal link relations saved to ${internalPath} (${Object.keys(sortedInternal).length} target URLs)`
        );
      }

      // Save external link relations
      if (externalRelations.length > 0) {
        const externalPath = path.join(this.config.stateDir, 'external-link-relations.json');
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

        await fs.promises.writeFile(externalPath, JSON.stringify(sortedExternal, null, 2), 'utf-8');
        logger.info(
          `External link relations saved to ${externalPath} (${Object.keys(sortedExternal).length} target URLs)`
        );
      }
    }
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
    await this.saveFinalResults();

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
            if (!this.config.respectRobotsTxt || isUrlAllowed(page.url, null)) {
              this.pages.push(page);
              this.visitedUrls.add(page.url);
            }
          }
        }

        await this.delayManager.wait();
      } catch (error) {
        logger.warn(
          `Failed to parse sitemap ${sitemapUrl}: ${formatAxiosError(error, sitemapUrl)}`
        );
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

        // Extract links from the page - pass the ORIGINAL url, not normalized
        const { internal, external } = this.extractLinks(response.data, url);

        for (const link of internal) {
          const normalizedLink = normalizeUrl(decodeUrl(link));
          if (!this.visitedUrls.has(normalizedLink)) {
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
        // Track as broken link
        const normalizedUrl = normalizeUrl(decodeUrl(url));
        this.brokenLinks.add(normalizedUrl);
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
   * Save final results (sitemap, link reports, link relations)
   */
  private async saveFinalResults(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const { ensureDir } = await import('./file-utils');

    await ensureDir(this.config.stateDir);

    logger.debug(`Saving final results: ${this.linkRelations.length} link relations tracked`);

    // Save sitemap
    const siteMap: SiteMap = {
      urls: this.pages,
      lastUpdated: new Date(),
    };

    if (siteMap.urls.length > 0) {
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
    } else {
      logger.info('No URLs to save in sitemap');
    }

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

    // Save link relations in hierarchical format (excluding self-references)
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

      // Save internal link relations
      if (internalRelations.length > 0) {
        const internalPath = path.join(this.config.stateDir, 'internal-link-relations.json');
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

        await fs.promises.writeFile(internalPath, JSON.stringify(sortedInternal, null, 2), 'utf-8');
      }

      // Save external link relations
      if (externalRelations.length > 0) {
        const externalPath = path.join(this.config.stateDir, 'external-link-relations.json');
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

        await fs.promises.writeFile(externalPath, JSON.stringify(sortedExternal, null, 2), 'utf-8');
      }
    }
  }
}

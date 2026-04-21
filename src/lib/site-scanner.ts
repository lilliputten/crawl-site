// src/lib/site-scanner.ts

import axios from 'axios';
import { CrawlConfig, PageData, SiteMap } from '../types';
import { parseSitemapUrls, extractTitle } from './sitemap-parser';
import { fetchRobotsTxt, isUrlAllowed } from './robots-parser';
import { DelayManager } from './delay-manager';
import { StateManager } from './state-manager';
import { Logger } from './logger';
import { normalizeUrl, decodeUrl, isValidUrl, isSameDomain } from './url-utils';
import { JSDOM } from 'jsdom';

const logger = new Logger();

export class SiteScanner {
  private config: CrawlConfig;
  private delayManager: DelayManager;
  private stateManager: StateManager;
  private visitedUrls: Set<string> = new Set();
  private pages: PageData[] = [];

  constructor(config: CrawlConfig, delayManager: DelayManager, stateManager: StateManager) {
    this.config = config;
    this.delayManager = delayManager;
    this.stateManager = stateManager;
  }

  /**
   * Scan the site and build a complete sitemap
   */
  async scan(): Promise<SiteMap> {
    logger.info(`Starting scan of ${this.config.siteUrl}`);

    // Fetch robots.txt if configured
    let robotsTxt = null;
    if (this.config.respectRobotsTxt) {
      robotsTxt = await fetchRobotsTxt(this.config.siteUrl, this.config);
      if (robotsTxt) {
        logger.info(`Found ${robotsTxt.sitemaps.length} sitemaps in robots.txt`);
        // Add sitemaps from robots.txt to our list
        this.config.sitemapUrls = [...new Set([...this.config.sitemapUrls, ...robotsTxt.sitemaps])];
      }
    }

    // Try to parse provided sitemaps
    if (this.config.sitemapUrls.length > 0) {
      await this.parseSitemaps();
    } else {
      // No sitemaps provided, try to discover by crawling
      logger.info('No sitemaps provided, will discover URLs by crawling');
      await this.crawlForUrls(this.config.siteUrl);
    }

    // Save sitemap
    const siteMap: SiteMap = {
      urls: this.pages,
      lastUpdated: new Date(),
    };

    await this.saveSiteMap(siteMap);

    logger.info(`Scan complete. Found ${this.pages.length} pages`);
    
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
    const queue: string[] = [startURL];
    
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
        const links = this.extractLinks(response.data, url);
        
        for (const link of links) {
          if (!this.visitedUrls.has(link) && isSameDomain(link, startURL)) {
            if (!this.config.respectRobotsTxt || isUrlAllowed(link, null)) {
              queue.push(link);
            }
          }
        }

        await this.delayManager.wait();
        this.delayManager.recordSuccess();
      } catch (error) {
        logger.warn(`Failed to scan ${url}:`, error);
        this.delayManager.recordError();
        await this.delayManager.wait();
      }
    }
  }

  /**
   * Extract all links from HTML content
   */
  private extractLinks(html: string, baseUrl: string): string[] {
    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;
      const links: string[] = [];

      const elements = document.querySelectorAll('a[href]');
      
      elements.forEach((element) => {
        const href = element.getAttribute('href');
        if (href) {
          try {
            // Handle relative URLs
            const fullUrl = new URL(href, baseUrl).toString();
            
            // Only include URLs from the same domain
            if (isSameDomain(fullUrl, baseUrl)) {
              const normalized = normalizeUrl(decodeUrl(fullUrl));
              links.push(normalized);
            }
          } catch {
            // Skip invalid URLs
          }
        }
      });

      return links;
    } catch (error) {
      logger.error('Failed to extract links:', error);
      return [];
    }
  }

  /**
   * Save sitemap to file
   */
  private async saveSiteMap(siteMap: SiteMap): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    const sitemapPath = path.join(this.config.stateDir, 'sitemap.json');
    const data = {
      ...siteMap,
      urls: siteMap.urls.map(p => ({
        ...p,
        lastModified: p.lastModified?.toISOString(),
      })),
      lastUpdated: siteMap.lastUpdated.toISOString(),
    };
    
    await fs.promises.writeFile(sitemapPath, JSON.stringify(data, null, 2), 'utf-8');
    logger.info(`Sitemap saved to ${sitemapPath}`);
  }
}

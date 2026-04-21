// src/lib/web-crawler.ts

import axios from 'axios';
import * as path from 'path';
import { CrawlConfig, PageData } from '@/types';
import { DelayManager } from './delay-manager';
import { StateManager } from './state-manager';
import { Logger } from './logger';
import { urlToFilePath } from './url-utils';
import { saveFile } from './file-utils';
import { fetchRobotsTxt, isUrlAllowed } from './robots-parser';

const logger = new Logger();

export class WebCrawler {
  private config: CrawlConfig;
  private delayManager: DelayManager;
  private stateManager: StateManager;
  private robotsTxt: any = null;

  constructor(config: CrawlConfig, delayManager: DelayManager, stateManager: StateManager) {
    this.config = config;
    this.delayManager = delayManager;
    this.stateManager = stateManager;
  }

  /**
   * Start/resume crawling
   */
  async crawl(): Promise<void> {
    logger.info(`Starting crawl of ${this.config.siteUrl}`);

    // Fetch robots.txt if configured
    if (this.config.respectRobotsTxt) {
      this.robotsTxt = await fetchRobotsTxt(this.config.siteUrl, this.config);
    }

    // Load sitemap and add to queue
    await this.loadSitemap();

    let pageCount = 0;

    while (true) {
      const nextUrl = this.stateManager.getNextFromQueue();

      if (!nextUrl) {
        logger.info('No more URLs in queue');
        break;
      }

      // Check max pages limit
      if (this.config.maxPages > 0 && pageCount >= this.config.maxPages) {
        logger.info(`Reached max pages limit (${this.config.maxPages})`);
        break;
      }

      // Check if URL is allowed
      if (this.config.respectRobotsTxt && !isUrlAllowed(nextUrl, this.robotsTxt)) {
        logger.debug(`URL blocked by robots.txt: ${nextUrl}`);
        this.stateManager.removeFromQueue(nextUrl);
        continue;
      }

      try {
        logger.info(`Crawling (${pageCount + 1}): ${nextUrl}`);

        const response = await axios.get(nextUrl, {
          timeout: this.config.requestTimeout,
          headers: {
            'User-Agent': this.config.userAgent,
          },
        });

        const pageData: PageData = {
          url: nextUrl,
          title: this.extractTitle(response.data),
          content: response.data,
          status: response.status,
        };

        // Save the HTML content
        await this.savePage(nextUrl, response.data);

        // Mark as completed
        this.stateManager.markCompleted(nextUrl, pageData);

        pageCount++;
        this.delayManager.recordSuccess();

        // Save state periodically
        if (pageCount % 10 === 0) {
          await this.stateManager.saveState();
          const stats = this.stateManager.getStats();
          logger.info(
            `Progress: ${stats.completed} completed, ${stats.failed} failed, ${stats.queued} queued`
          );
        }

        await this.delayManager.wait();
      } catch (error) {
        logger.error(`Failed to crawl ${nextUrl}:`, error);
        this.delayManager.recordError();

        // Retry with exponential backoff
        const retries = this.config.maxRetries;
        let success = false;

        for (let attempt = 0; attempt < retries; attempt++) {
          const retryDelay = this.delayManager.getRetryDelay(attempt);
          logger.info(`Retrying (${attempt + 1}/${retries}) after ${retryDelay}ms: ${nextUrl}`);

          await new Promise((resolve) => setTimeout(resolve, retryDelay));

          try {
            const response = await axios.get(nextUrl, {
              timeout: this.config.requestTimeout,
              headers: {
                'User-Agent': this.config.userAgent,
              },
            });

            const pageData: PageData = {
              url: nextUrl,
              title: this.extractTitle(response.data),
              content: response.data,
              status: response.status,
            };

            await this.savePage(nextUrl, response.data);
            this.stateManager.markCompleted(nextUrl, pageData);

            pageCount++;
            this.delayManager.recordSuccess();
            success = true;
            break;
          } catch (retryError) {
            logger.warn(`Retry ${attempt + 1} failed for ${nextUrl}`);
          }
        }

        if (!success) {
          this.stateManager.markFailed(nextUrl, String(error));
        }

        await this.delayManager.wait();
      }
    }

    // Final state save
    await this.stateManager.saveState();
    const stats = this.stateManager.getStats();
    logger.info(`Crawl complete: ${stats.completed} completed, ${stats.failed} failed`);
  }

  /**
   * Load URLs from sitemap into queue
   */
  private async loadSitemap(): Promise<void> {
    const fs = await import('fs');
    const sitemapPath = path.join(this.config.stateDir, 'sitemap.json');

    if (!fs.existsSync(sitemapPath)) {
      logger.warn('Sitemap not found. Run scan first.');
      return;
    }

    try {
      const content = await fs.promises.readFile(sitemapPath, 'utf-8');
      const sitemap = JSON.parse(content);

      const urls = sitemap.urls.map((p: PageData) => p.url);
      this.stateManager.addToQueue(urls);

      logger.info(`Loaded ${urls.length} URLs from sitemap`);
    } catch (error) {
      logger.error('Failed to load sitemap:', error);
    }
  }

  /**
   * Save page HTML to file
   */
  private async savePage(url: string, html: string): Promise<void> {
    const filePath = urlToFilePath(url, this.config.siteUrl, this.config.dest);
    await saveFile(filePath, html);
    logger.debug(`Saved: ${filePath}`);
  }

  /**
   * Extract title from HTML
   */
  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
    return match ? match[1].trim() : '';
  }
}

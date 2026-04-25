// src/lib/state-manager.ts

import * as path from 'path';
import {
  CrawlConfig,
  CrawlState,
  PageData,
  LinkRelation,
  RedirectedPage,
  BrokenLink,
} from '@/types';
import { ensureDir, fileExists, readYamlFile, writeYamlFile } from './file-utils';
import { Logger } from './logger';

const logger = new Logger();

/**
 * Configure the module-level logger with settings from config
 */
export function configureLogger(config: CrawlConfig): void {
  logger.configure({ logLevel: config.logLevel, noColor: config.noColor });
}

export class StateManager {
  private config: CrawlConfig;
  private stateDir: string;
  private stateFile: string;
  private state: CrawlState;

  constructor(config: CrawlConfig) {
    this.config = config;
    this.stateDir = config.stateDir;
    this.stateFile = path.join(this.stateDir, 'crawl-state.yaml');
    this.state = {
      // All the state data: queued, completed, failed, brokenLinks, externalLinks, linkRelations, lastProcessed, crawledPages, redirectedPages
      queued: [],
      completed: new Map(),
      failed: new Map(),
      brokenLinks: [], // Assuming BrokenLink[] type in CrawlState
      externalLinks: new Set(),
      jsLinks: new Set(),
      nonHtmlLinks: new Set(),
      linkRelations: [],
      lastProcessed: new Date(),
      crawledPages: [],
      redirectedPages: [],
    };
  }

  /**
   * Initialize state manager and load existing state if available
   */
  async initialize(): Promise<void> {
    await ensureDir(this.stateDir);

    // Load broken links from broken-links.yaml (if exists)
    const brokenLinksPath = path.join(this.stateDir, 'broken-links.yaml');
    if (fileExists(brokenLinksPath)) {
      try {
        const brokenLinksData = await readYamlFile<any>(brokenLinksPath);
        if (brokenLinksData && Array.isArray(brokenLinksData)) {
          this.state.brokenLinks = brokenLinksData.map((item: any) => ({
            url: item.url || item,
            statusCode: item.statusCode || null,
            timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
          }));
          logger.info(
            `Loaded ${this.state.brokenLinks.length} broken links with status codes from broken-links.yaml`
          );
        }
      } catch (error) {
        logger.warn('Failed to load broken-links.yaml:', error);
      }
    }

    // Load external links from external-links.yaml (if exists)
    const externalLinksPath = path.join(this.stateDir, 'external-links.yaml');
    if (fileExists(externalLinksPath)) {
      try {
        const externalLinksData = await readYamlFile<any>(externalLinksPath);
        if (externalLinksData && Array.isArray(externalLinksData)) {
          this.state.externalLinks = new Set(externalLinksData);
          logger.info(
            `Loaded ${this.state.externalLinks.size} external links from external-links.yaml`
          );
        }
      } catch (error) {
        logger.warn('Failed to load external-links.yaml:', error);
      }
    }

    // Load JavaScript links from js-links.yaml (if exists)
    const jsLinksPath = path.join(this.stateDir, 'js-links.yaml');
    if (fileExists(jsLinksPath)) {
      try {
        const jsLinksData = await readYamlFile<any>(jsLinksPath);
        if (jsLinksData && Array.isArray(jsLinksData)) {
          this.state.jsLinks = new Set(jsLinksData);
          logger.info(`Loaded ${this.state.jsLinks.size} JavaScript links from js-links.yaml`);
        }
      } catch (error) {
        logger.warn('Failed to load js-links.yaml:', error);
      }
    }

    // Load non-HTML links from non-html-links.yaml (if exists)
    const nonHtmlLinksPath = path.join(this.stateDir, 'non-html-links.yaml');
    if (fileExists(nonHtmlLinksPath)) {
      try {
        const nonHtmlLinksData = await readYamlFile<any>(nonHtmlLinksPath);
        if (nonHtmlLinksData && Array.isArray(nonHtmlLinksData)) {
          this.state.nonHtmlLinks = new Set(nonHtmlLinksData);
          logger.info(
            `Loaded ${this.state.nonHtmlLinks.size} non-HTML links from non-html-links.yaml`
          );
        }
      } catch (error) {
        logger.warn('Failed to load non-html-links.yaml:', error);
      }
    }

    // Load redirected pages from redirected-pages.yaml (if exists)
    const redirectedPagesPath = path.join(this.stateDir, 'redirected-pages.yaml');
    if (fileExists(redirectedPagesPath)) {
      try {
        const redirectedPagesData = await readYamlFile<any>(redirectedPagesPath);
        if (redirectedPagesData && Array.isArray(redirectedPagesData)) {
          this.state.redirectedPages = redirectedPagesData.map((p: any) => ({
            url: p.url,
            statusCode: p.statusCode,
            redirectUrl: p.redirectUrl,
            timestamp: p.timestamp ? new Date(p.timestamp) : new Date(), // Use current time if timestamp not present
          }));
          logger.info(
            `Loaded ${this.state.redirectedPages.length} redirected pages from redirected-pages.yaml`
          );
        }
      } catch (error) {
        logger.warn('Failed to load redirected-pages.yaml:', error);
      }
    }

    // Load link relations from internal-link-relations.yaml and external-link-relations.yaml (if exist)
    const internalRelationsPath = path.join(this.stateDir, 'internal-link-relations.yaml');
    const externalRelationsPath = path.join(this.stateDir, 'external-link-relations.yaml');

    if (fileExists(internalRelationsPath) || fileExists(externalRelationsPath)) {
      try {
        const linkRelations: LinkRelation[] = [];

        // Load internal link relations
        if (fileExists(internalRelationsPath)) {
          const internalData = await readYamlFile<any>(internalRelationsPath);
          if (internalData && typeof internalData === 'object') {
            Object.entries(internalData).forEach(([targetUrl, sourceUrls]: [string, any]) => {
              if (Array.isArray(sourceUrls)) {
                sourceUrls.forEach((sourceUrl: string) => {
                  linkRelations.push({
                    sourceUrl,
                    targetUrl,
                  });
                });
              }
            });
          }
        }

        // Load external link relations
        if (fileExists(externalRelationsPath)) {
          const externalData = await readYamlFile<any>(externalRelationsPath);
          if (externalData && typeof externalData === 'object') {
            Object.entries(externalData).forEach(([targetUrl, sourceUrls]: [string, any]) => {
              if (Array.isArray(sourceUrls)) {
                sourceUrls.forEach((sourceUrl: string) => {
                  linkRelations.push({
                    sourceUrl,
                    targetUrl,
                  });
                });
              }
            });
          }
        }

        this.state.linkRelations = linkRelations;
        logger.info(
          `Loaded ${this.state.linkRelations.length} link relations from link relation files`
        );
      } catch (error) {
        logger.warn('Failed to load link relations YAML files:', error);
      }
    }

    // Load queued URLs from queued.yaml (if exists)
    const queuedPath = path.join(this.stateDir, 'queued.yaml');
    if (fileExists(queuedPath)) {
      try {
        const queuedData = await readYamlFile<any>(queuedPath);
        if (queuedData && Array.isArray(queuedData)) {
          this.state.queued = queuedData;
          logger.info(`Loaded ${this.state.queued.length} queued URLs from queued.yaml`);
        }
      } catch (error) {
        logger.warn('Failed to load queued.yaml:', error);
      }
    }

    // Load completed pages from completed.yaml (if exists)
    const completedPath = path.join(this.stateDir, 'completed.yaml');
    if (fileExists(completedPath)) {
      try {
        const completedData = await readYamlFile<any>(completedPath);
        if (completedData && Array.isArray(completedData)) {
          // Convert array of PageData to Map
          this.state.completed = new Map(completedData.map((page: PageData) => [page.url, page]));
          logger.info(`Loaded ${this.state.completed.size} completed pages from completed.yaml`);
        }
      } catch (error) {
        logger.warn('Failed to load completed.yaml:', error);
      }
    }

    // Load failed pages from failed.yaml (if exists)
    const failedPath = path.join(this.stateDir, 'failed.yaml');
    if (fileExists(failedPath)) {
      try {
        const failedData = await readYamlFile<any>(failedPath);
        if (failedData && Array.isArray(failedData)) {
          // Convert array of {url, error} to Map
          this.state.failed = new Map(
            failedData.map((item: { url: string; error: string }) => [item.url, item.error])
          );
          logger.info(`Loaded ${this.state.failed.size} failed pages from failed.yaml`);
        }
      } catch (error) {
        logger.warn('Failed to load failed.yaml:', error);
      }
    }

    // Load crawl-state.yaml for metadata only (scan times, lastProcessed, etc.)
    if (fileExists(this.stateFile)) {
      try {
        const data = await readYamlFile<any>(this.stateFile);

        if (!data) {
          logger.warn('Failed to parse state file, starting fresh');
          return;
        }

        // Update metadata fields from crawl-state.yaml
        if (data.scanStartTime) {
          this.state.scanStartTime = new Date(data.scanStartTime);
        }
        if (data.lastProcessed) {
          this.state.lastProcessed = new Date(data.lastProcessed);
        }

        logger.info(
          `Loaded metadata from crawl-state.yaml (actual data loaded from separate YAML files)`
        );
      } catch (error) {
        logger.warn('Failed to load crawl-state.yaml:', error);
      }
    } else {
      logger.info('No existing state found, starting fresh');
    }
  }

  /**
   * Save current state to disk
   * Saves large datasets to separate YAML files and metadata to crawl-state.yaml
   * @param updateLastProcessed - Whether to update the lastProcessed timestamp (default: true)
   */
  async saveState(updateLastProcessed: boolean = true): Promise<void> {
    try {
      // Save queued URLs to queued.yaml
      if (this.state.queued.length > 0) {
        const queuedPath = path.join(this.stateDir, 'queued.yaml');
        await writeYamlFile(queuedPath, this.state.queued);
        logger.debug(`Queued URLs saved to ${queuedPath} (${this.state.queued.length} URLs)`);
      }

      // Save completed pages to completed.yaml
      if (this.state.completed.size > 0) {
        const completedPath = path.join(this.stateDir, 'completed.yaml');
        const completedData = Array.from(this.state.completed.values());
        await writeYamlFile(completedPath, completedData);
        logger.debug(
          `Completed pages saved to ${completedPath} (${this.state.completed.size} pages)`
        );
      }

      // Save failed pages to failed.yaml
      if (this.state.failed.size > 0) {
        const failedPath = path.join(this.stateDir, 'failed.yaml');
        const failedData = Array.from(this.state.failed.entries()).map(([url, error]) => ({
          url,
          error,
        }));
        await writeYamlFile(failedPath, failedData);
        logger.debug(`Failed pages saved to ${failedPath} (${this.state.failed.size} pages)`);
      }

      // Save broken links to broken-links.yaml (already handled by saveBrokenLinks)
      // Save external links to external-links.yaml (already handled separately)
      // Save link relations to internal/external-link-relations.yaml (already handled by saveLinkRelations)
      // Save redirected pages to redirected-pages.yaml (already handled by saveRedirectedPages)

      // Save only metadata to crawl-state.yaml (no large arrays/maps)
      const metadata = {
        lastProcessed: updateLastProcessed
          ? new Date().toISOString()
          : this.state.lastProcessed.toISOString(),
        scanStartTime: this.state.scanStartTime,
        totalPagesScanned: this.state.completed.size,
        totalQueued: this.state.queued.length,
        totalFailed: this.state.failed.size,
        totalBrokenLinks: this.state.brokenLinks.length,
        totalExternalLinks: this.state.externalLinks.size,
        totalLinkRelations: this.state.linkRelations.length,
        totalCrawledPages: this.state.crawledPages.length,
        totalRedirectedPages: this.state.redirectedPages.length,
      };

      await writeYamlFile(this.stateFile, metadata);
      logger.debug('State metadata saved successfully');
    } catch (error) {
      logger.error(
        `Failed to save state: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the current state (read-only access)
   */
  getState(): CrawlState {
    return this.state;
  }

  /**
   * Add URLs to the queue
   */
  addToQueue(urls: string[]): void {
    for (const url of urls) {
      if (!this.state.queued.includes(url) && !this.state.completed.has(url)) {
        this.state.queued.push(url);
      }
    }
  }

  /**
   * Get next URL from queue
   */
  getNextFromQueue(): string | null {
    return this.state.queued.length > 0 ? this.state.queued[0] : null;
  }

  /**
   * Remove URL from queue
   */
  removeFromQueue(url: string): void {
    const index = this.state.queued.indexOf(url);
    if (index !== -1) {
      this.state.queued.splice(index, 1);
    }
  }

  /**
   * Mark URL as completed
   */
  markCompleted(url: string, pageData: PageData): void {
    this.removeFromQueue(url);
    this.state.completed.set(url, pageData);
    this.state.lastProcessed = new Date();
  }

  /**
   * Mark URL as failed
   */
  markFailed(url: string, error: string): void {
    this.removeFromQueue(url);
    this.state.failed.set(url, error);
    this.state.lastProcessed = new Date();
  }

  /**
   * Check if URL has been processed
   */
  isProcessed(url: string): boolean {
    return this.state.completed.has(url) || this.state.failed.has(url);
  }

  /**
   * Get statistics
   */
  getStats(): {
    queued: number;
    completed: number;
    failed: number;
    brokenLinks: number;
    externalLinks: number;
  } {
    return {
      queued: this.state.queued.length,
      completed: this.state.completed.size,
      failed: this.state.failed.size,
      brokenLinks: this.state.brokenLinks.length,
      externalLinks: this.state.externalLinks.size,
    };
  }

  /**
   * Add a broken internal link
   */
  addBrokenLink(url: string, statusCode?: number): void {
    // Check if this URL already exists
    const existingIndex = this.state.brokenLinks.findIndex((link) => link.url === url);

    if (existingIndex !== -1) {
      // Update existing entry with new status code and timestamp
      this.state.brokenLinks[existingIndex] = {
        url,
        statusCode: statusCode || this.state.brokenLinks[existingIndex].statusCode,
        // error: error || this.state.brokenLinks[existingIndex].error,
        timestamp: new Date(),
      };
      logger.warn(`Broken link updated: ${url} (status: ${statusCode})`);
    } else {
      // Add new broken link entry
      this.state.brokenLinks.push({
        url,
        statusCode: statusCode || null,
        // error: error || undefined,
        timestamp: new Date(),
      });
      logger.warn(`Broken link detected: ${url} (status: ${statusCode})`);
    }
  }

  /**
   * Add an external link
   */
  addExternalLink(url: string): void {
    this.state.externalLinks.add(url);
  }

  /**
   * Get all broken links
   */
  getBrokenLinks(): BrokenLink[] {
    return [...this.state.brokenLinks];
  }

  /**
   * Get all external links
   */
  getExternalLinks(): string[] {
    return Array.from(this.state.externalLinks);
  }

  /**
   * Get all JavaScript links
   */
  getJsLinks(): string[] {
    return Array.from(this.state.jsLinks);
  }

  /**
   * Get all non-HTML links
   */
  getNonHtmlLinks(): string[] {
    return Array.from(this.state.nonHtmlLinks);
  }

  /**
   * Get scan start time (ISO string) if available
   */
  getScanStartTime(): Date | undefined {
    return this.state.scanStartTime;
  }

  /**
   * Set scan start time
   */
  setScanStartTime(startTime: Date): void {
    this.state.scanStartTime = startTime;
  }

  setLastProcessed(lastProcessed: Date = new Date()): void {
    this.state.lastProcessed = lastProcessed;
  }
  /**
   * Get all queued URLs
   */
  getQueuedUrls(): string[] {
    return [...this.state.queued];
  }

  /**
   * Get all completed page data
   */
  getCompletedPages(): PageData[] {
    return Array.from(this.state.completed.values());
  }

  /**
   * Clear all state
   */
  async clearState(): Promise<void> {
    this.state = {
      queued: [],
      completed: new Map(),
      failed: new Map(),
      brokenLinks: [],
      externalLinks: new Set(),
      jsLinks: new Set(),
      nonHtmlLinks: new Set(),
      linkRelations: [],
      lastProcessed: new Date(),
      crawledPages: [],
      redirectedPages: [],
    };
    await this.saveState();
    logger.info('State cleared');
  }

  /**
   * Update state with scanner data (batch update)
   */
  updateFromScanner(data: {
    pages: PageData[];
    brokenLinks: any[]; // Assuming BrokenLink[] or similar structure from scanner
    externalLinks: string[];
    linkRelations: LinkRelation[];
    crawledPages: string[];
    redirectedPages?: RedirectedPage[];
  }): void {
    // Update completed pages
    data.pages.forEach((page) => {
      this.state.completed.set(page.url, page);
    });

    // Update broken links
    // Merge existing and new broken links, avoiding duplicates by URL
    const existingUrls = new Set(this.state.brokenLinks.map((l) => l.url));
    data.brokenLinks.forEach((newLink) => {
      if (!existingUrls.has(newLink.url)) {
        this.state.brokenLinks.push(newLink);
        existingUrls.add(newLink.url);
      }
    });

    // Update external links
    data.externalLinks.forEach((url) => {
      this.state.externalLinks.add(url);
    });

    // Update link relations
    this.state.linkRelations = [...this.state.linkRelations, ...data.linkRelations];

    // Update crawled pages
    this.state.crawledPages = [...new Set([...this.state.crawledPages, ...data.crawledPages])];

    // Update redirected pages
    if (data.redirectedPages && data.redirectedPages.length > 0) {
      this.state.redirectedPages = [
        ...new Map(
          [...this.state.redirectedPages, ...data.redirectedPages].map((p) => [p.url, p])
        ).values(),
      ];
    }

    logger.info(
      `State updated from scanner: ${data.pages.length} pages, ${data.brokenLinks.length} broken links, ${data.externalLinks.length} external links, ${data.linkRelations.length} relations${data.redirectedPages ? `, ${data.redirectedPages.length} redirects` : ''}`
    );
  }

  /**
   * Add a link relation between pages
   */
  addLinkRelation(sourceUrl: string, targetUrl: string, linkText?: string): void {
    const relation: LinkRelation = {
      sourceUrl,
      targetUrl,
      linkText,
    };
    this.state.linkRelations.push(relation);
  }

  /**
   * Get all link relations
   */
  getLinkRelations(): LinkRelation[] {
    return [...this.state.linkRelations];
  }

  /**
   * Get all pages that link to a specific target URL
   */
  getPagesLinkingTo(targetUrl: string): LinkRelation[] {
    return this.state.linkRelations.filter((relation) => relation.targetUrl === targetUrl);
  }

  /**
   * Get all pages that a specific source URL links to
   */
  getPagesLinkedFrom(sourceUrl: string): LinkRelation[] {
    return this.state.linkRelations.filter((relation) => relation.sourceUrl === sourceUrl);
  }

  /**
   * Save link relations to separate files for internal and external links
   * Format: { targetUrl: [sourceUrl1, sourceUrl2, ...] }
   */
  async saveLinkRelations(): Promise<void> {
    await ensureDir(this.stateDir);

    // Get site domain to separate internal/external
    let siteDomain: string;
    try {
      siteDomain = new URL(this.config.siteUrl).host;
    } catch (error) {
      logger.error(`Invalid site URL: ${this.config.siteUrl}`);
      return;
    }

    // Separate internal and external relations
    const internalRelations: LinkRelation[] = [];
    const externalRelations: LinkRelation[] = [];

    this.state.linkRelations.forEach((relation) => {
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

    // Helper function to convert to hierarchical format
    const convertToHierarchical = (relations: LinkRelation[]): Record<string, string[]> => {
      const hierarchical: Record<string, string[]> = {};

      relations.forEach((relation) => {
        if (!hierarchical[relation.targetUrl]) {
          hierarchical[relation.targetUrl] = [];
        }
        if (!hierarchical[relation.targetUrl].includes(relation.sourceUrl)) {
          hierarchical[relation.targetUrl].push(relation.sourceUrl);
        }
      });

      // Sort by target URL
      const sorted: Record<string, string[]> = {};
      Object.keys(hierarchical)
        .sort()
        .forEach((key) => {
          sorted[key] = hierarchical[key].sort();
        });

      return sorted;
    };

    // Save internal link relations
    if (internalRelations.length > 0) {
      const internalPath = path.join(this.stateDir, 'internal-link-relations.yaml');
      const sortedInternal = convertToHierarchical(internalRelations);

      await writeYamlFile(internalPath, sortedInternal);
      logger.info(
        `Internal link relations saved to ${internalPath} (${Object.keys(sortedInternal).length} target URLs)`
      );
    }

    // Save external link relations
    if (externalRelations.length > 0) {
      const externalPath = path.join(this.stateDir, 'external-link-relations.yaml');
      const sortedExternal = convertToHierarchical(externalRelations);

      await writeYamlFile(externalPath, sortedExternal);
      logger.info(
        `External link relations saved to ${externalPath} (${Object.keys(sortedExternal).length} target URLs)`
      );
    }

    // Log summary if no relations found
    if (internalRelations.length === 0 && externalRelations.length === 0) {
      logger.debug('No link relations to save');
    }
  }

  /**
   * Save broken links to a separate file
   */
  async saveBrokenLinks(): Promise<void> {
    if (this.state.brokenLinks.length > 0) {
      const brokenLinksPath = path.join(this.stateDir, 'broken-links.yaml');

      // Sort by URL and ensure all fields are present
      const brokenLinksData = this.state.brokenLinks
        .sort((a, b) => a.url.localeCompare(b.url))
        .map((link) => ({
          url: link.url,
          statusCode: link.statusCode || null,
          // error: link.error || undefined,
          timestamp: link.timestamp.toISOString(),
        }));

      await writeYamlFile(brokenLinksPath, brokenLinksData);
      logger.info(
        `Broken links saved to ${brokenLinksPath} (${this.state.brokenLinks.length} links)`
      );
    } else {
      logger.info('No broken links to save');
    }
  }

  /* // UNUSED: addRedirectedPage
   * addRedirectedPage(url: string, statusCode: number, redirectUrl: string): void {
   *   const redirectedPage: RedirectedPage = {
   *     url,
   *     statusCode,
   *     redirectUrl,
   *     timestamp: new Date(),
   *   };
   *   // Check if already exists and update if needed
   *   const existingIndex = this.state.redirectedPages.findIndex((p) => p.url === url);
   *   if (existingIndex !== -1) {
   *     this.state.redirectedPages[existingIndex] = redirectedPage;
   *   } else {
   *     this.state.redirectedPages.push(redirectedPage);
   *   }
   *   logger.info(`Redirect detected: ${url} -> ${decodeUrl(redirectUrl)} (${statusCode})`);
   * }
   */

  /**
   * Get all redirected pages
   */
  getRedirectedPages(): RedirectedPage[] {
    return [...this.state.redirectedPages];
  }

  /**
   * Save redirected pages to a separate file
   */
  async saveRedirectedPages(): Promise<void> {
    if (this.state.redirectedPages.length > 0) {
      const redirectedPagesPath = path.join(this.stateDir, 'redirected-pages.yaml');
      await writeYamlFile(redirectedPagesPath, this.state.redirectedPages);
      logger.info(
        `Redirected pages saved to ${redirectedPagesPath} (${this.state.redirectedPages.length} pages)`
      );
    } else {
      logger.info('No redirected pages to save');
    }
  }
}

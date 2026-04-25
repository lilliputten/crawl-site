// src/lib/state-manager.ts

import * as path from 'path';
import { CrawlConfig, CrawlState, PageData, LinkRelation, RedirectedPage } from '@/types';
import { ensureDir, fileExists, readYamlFile, writeYamlFile } from './file-utils';
import { Logger } from './logger';
// import { formatError } from './error-formatter'; // TODO: Add error formatting utility if needed

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
      brokenLinks: [],
      externalLinks: new Set(),
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

    // Load broken links from broken-links.yaml first (if exists)
    const brokenLinksPath = path.join(this.stateDir, 'broken-links.yaml');
    if (fileExists(brokenLinksPath)) {
      try {
        const brokenLinksData = await readYamlFile<any>(brokenLinksPath);
        if (brokenLinksData && Array.isArray(brokenLinksData)) {
          // Handle both old format (string[]) and new format ({url, statusCode}[])
          if (brokenLinksData.length > 0 && typeof brokenLinksData[0] === 'object') {
            // New format with status codes
            this.state.brokenLinks = brokenLinksData.map((item: any) => item.url || item);
            logger.info(
              `Loaded ${this.state.brokenLinks.length} broken links with status codes from broken-links.yaml`
            );
          } else {
            // Old format (plain strings)
            this.state.brokenLinks = brokenLinksData;
            logger.info(
              `Loaded ${this.state.brokenLinks.length} broken links from broken-links.yaml`
            );
          }
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

    // Load internal links from internal-links.yaml (if exists)
    const internalLinksPath = path.join(this.stateDir, 'internal-links.yaml');
    if (fileExists(internalLinksPath)) {
      try {
        const internalLinksData = await readYamlFile<any>(internalLinksPath);
        if (internalLinksData && Array.isArray(internalLinksData)) {
          // Store internal links in a temporary field since CrawlState doesn't have internalLinks array
          // We'll use brokenLinks array structure as a reference, but we need to track this differently
          // For now, we'll just log that we found them
          logger.info(
            `Found ${internalLinksData.length} internal links in internal-links.yaml (not loaded into state)`
          );
        }
      } catch (error) {
        logger.warn('Failed to load internal-links.yaml:', error);
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

    if (fileExists(this.stateFile)) {
      try {
        const data = await readYamlFile<any>(this.stateFile);

        if (!data) {
          logger.warn('Failed to parse state file, starting fresh');
          return;
        }

        // Check if this is a summary-only file (new format) or full state file (old format)
        const isSummaryOnly = data.totalPagesScanned !== undefined && data.queued === undefined;

        if (isSummaryOnly) {
          // This is a summary-only file, don't overwrite the state loaded from separate YAML files
          // Just update lastProcessed and scanStartTime if available
          if (data.lastProcessed) {
            this.state.lastProcessed = new Date(data.lastProcessed);
          }
          if (data.scanStartTime) {
            this.state.scanStartTime = data.scanStartTime;
          }
          if (data.scanFinishTime) {
            this.state.scanFinishTime = data.scanFinishTime;
          }
          logger.info(
            `Loaded summary from crawl-state.yaml (actual data loaded from separate YAML files)`
          );
        } else {
          // This is a full state file with arrays and maps
          // Convert arrays back to Maps and Sets
          this.state = {
            queued: data.queued || [],
            completed: new Map(data.completed || []),
            failed: new Map(data.failed || []),
            // Keep broken links loaded from broken-links.yaml, or fall back to state file
            brokenLinks:
              this.state.brokenLinks.length > 0 ? this.state.brokenLinks : data.brokenLinks || [],
            externalLinks:
              this.state.externalLinks.size > 0
                ? this.state.externalLinks
                : new Set(data.externalLinks || []),
            linkRelations:
              this.state.linkRelations.length > 0
                ? this.state.linkRelations
                : data.linkRelations || [],
            lastProcessed: data.lastProcessed ? new Date(data.lastProcessed) : new Date(),
            crawledPages: data.crawledPages || [],
            redirectedPages:
              this.state.redirectedPages.length > 0
                ? this.state.redirectedPages
                : data.redirectedPages || [],
            scanStartTime: data.scanStartTime || this.state.scanStartTime,
            scanFinishTime: data.scanFinishTime || this.state.scanFinishTime,
          };

          logger.info(
            `Loaded existing state: ${this.state.completed.size} completed, ${this.state.failed.size} failed, ${this.state.queued.length} queued`
          );
        }
      } catch (error) {
        logger.warn('Failed to load state file, starting fresh:', error);
      }
    } else {
      logger.info('No existing state found, starting fresh');
    }
  }

  /**
   * Save current state to disk
   * @param updateLastProcessed - Whether to update the lastProcessed timestamp (default: true)
   */
  async saveState(updateLastProcessed: boolean = true): Promise<void> {
    try {
      // Convert Maps and Sets to arrays for serialization
      const data = {
        queued: this.state.queued,
        completed: Array.from(this.state.completed.entries()),
        failed: Array.from(this.state.failed.entries()),
        brokenLinks: this.state.brokenLinks,
        externalLinks: Array.from(this.state.externalLinks),
        linkRelations: this.state.linkRelations,
        lastProcessed: updateLastProcessed
          ? new Date().toISOString()
          : this.state.lastProcessed.toISOString(),
        redirectedPages: this.state.redirectedPages.map((p) => ({
          ...p,
          timestamp: p.timestamp.toISOString(),
        })),
        scanStartTime: this.state.scanStartTime,
        scanFinishTime: this.state.scanFinishTime,
      };

      await writeYamlFile(this.stateFile, data);
      logger.debug('State saved successfully');
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
  addBrokenLink(url: string): void {
    if (!this.state.brokenLinks.includes(url)) {
      this.state.brokenLinks.push(url);
      logger.warn(`Broken link detected: ${url}`);
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
  getBrokenLinks(): string[] {
    return [...this.state.brokenLinks];
  }

  /**
   * Get all external links
   */
  getExternalLinks(): string[] {
    return Array.from(this.state.externalLinks);
  }

  /**
   * Get scan start time (ISO string) if available
   */
  getScanStartTime(): string | undefined {
    return this.state.scanStartTime;
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
    brokenLinks: string[];
    externalLinks: string[];
    linkRelations: LinkRelation[];
    crawledPages: string[];
    redirectedPages?: RedirectedPage[];
    scanStartTime?: string;
  }): void {
    // Update completed pages
    data.pages.forEach((page) => {
      this.state.completed.set(page.url, page);
    });

    // Update broken links
    this.state.brokenLinks = [...new Set([...this.state.brokenLinks, ...data.brokenLinks])];

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

    // Update scan start time if provided
    if (data.scanStartTime) {
      this.state.scanStartTime = data.scanStartTime;
    }

    // Update last processed time
    this.state.lastProcessed = new Date();

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

      // Save in new structured format for consistency with SiteScanner
      // Note: StateManager doesn't track status codes, so statusCode will be null
      const brokenLinksData = this.state.brokenLinks.sort().map((url) => ({
        url,
        statusCode: null, // Status codes are tracked by SiteScanner
      }));

      await writeYamlFile(brokenLinksPath, brokenLinksData);
      logger.info(
        `Broken links saved to ${brokenLinksPath} (${this.state.brokenLinks.length} links)`
      );
    } else {
      logger.info('No broken links to save');
    }
  }

  /**
   * Add a redirected page
   */
  addRedirectedPage(url: string, statusCode: number, redirectUrl: string): void {
    const redirectedPage: RedirectedPage = {
      url,
      statusCode,
      redirectUrl,
      timestamp: new Date(),
    };

    // Check if already exists and update if needed
    const existingIndex = this.state.redirectedPages.findIndex((p) => p.url === url);
    if (existingIndex !== -1) {
      this.state.redirectedPages[existingIndex] = redirectedPage;
    } else {
      this.state.redirectedPages.push(redirectedPage);
    }

    logger.info(`Redirect detected: ${url} -> ${redirectUrl} (${statusCode})`);
  }

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
      // Exclude timestamp from saved data - only keep url, statusCode, and redirectUrl
      const data = this.state.redirectedPages.map((p) => ({
        url: p.url,
        statusCode: p.statusCode,
        redirectUrl: p.redirectUrl,
      }));
      await writeYamlFile(redirectedPagesPath, data);
      logger.info(
        `Redirected pages saved to ${redirectedPagesPath} (${this.state.redirectedPages.length} pages)`
      );
    } else {
      logger.info('No redirected pages to save');
    }
  }

  /**
   * Set the scan finish time
   */
  setScanFinishTime(finishTime: Date): void {
    this.state.scanFinishTime = finishTime.toISOString();
    logger.debug(`Scan finish time set to: ${this.state.scanFinishTime}`);
  }

  /**
   * Get the scan finish time as a Date object, or null if not set
   */
  getScanFinishTime(): Date | null {
    if (this.state.scanFinishTime) {
      return new Date(this.state.scanFinishTime);
    }
    return null;
  }
}

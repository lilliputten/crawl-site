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
        const brokenLinksData = await readYamlFile<string[]>(brokenLinksPath);
        if (brokenLinksData && Array.isArray(brokenLinksData)) {
          this.state.brokenLinks = brokenLinksData;
          logger.info(
            `Loaded ${this.state.brokenLinks.length} broken links from broken-links.yaml`
          );
        }
      } catch (error) {
        logger.warn('Failed to load broken-links.yaml:', error);
      }
    }

    if (fileExists(this.stateFile)) {
      try {
        const data = await readYamlFile<any>(this.stateFile);

        if (!data) {
          logger.warn('Failed to parse state file, starting fresh');
          return;
        }

        // Convert arrays back to Maps and Sets
        this.state = {
          queued: data.queued || [],
          completed: new Map(data.completed || []),
          failed: new Map(data.failed || []),
          // Keep broken links loaded from broken-links.yaml, or fall back to state file
          brokenLinks:
            this.state.brokenLinks.length > 0 ? this.state.brokenLinks : data.brokenLinks || [],
          externalLinks: new Set(data.externalLinks || []),
          linkRelations: data.linkRelations || [],
          lastProcessed: data.lastProcessed ? new Date(data.lastProcessed) : new Date(),
          crawledPages: data.crawledPages || [],
          redirectedPages: data.redirectedPages || [],
        };

        logger.info(
          `Loaded existing state: ${this.state.completed.size} completed, ${this.state.failed.size} failed, ${this.state.queued.length} queued`
        );
      } catch (error) {
        logger.warn('Failed to load state file, starting fresh:', error);
      }
    } else {
      logger.info('No existing state found, starting fresh');
    }
  }

  /**
   * Save current state to disk
   */
  async saveState(): Promise<void> {
    try {
      // Convert Maps and Sets to arrays for serialization
      const data = {
        queued: this.state.queued,
        completed: Array.from(this.state.completed.entries()),
        failed: Array.from(this.state.failed.entries()),
        brokenLinks: this.state.brokenLinks,
        externalLinks: Array.from(this.state.externalLinks),
        linkRelations: this.state.linkRelations,
        lastProcessed: this.state.lastProcessed.toISOString(),
        redirectedPages: this.state.redirectedPages.map((p) => ({
          ...p,
          timestamp: p.timestamp.toISOString(),
        })),
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

    // Also save broken links to a separate file
    await this.saveBrokenLinks();
  }

  /**
   * Save broken links to a separate file
   */
  async saveBrokenLinks(): Promise<void> {
    if (this.state.brokenLinks.length > 0) {
      const brokenLinksPath = path.join(this.stateDir, 'broken-links.yaml');
      await writeYamlFile(brokenLinksPath, this.state.brokenLinks.sort());
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
      const data = this.state.redirectedPages.map((p) => ({
        ...p,
        timestamp: p.timestamp.toISOString(),
      }));
      await writeYamlFile(redirectedPagesPath, data);
      logger.info(
        `Redirected pages saved to ${redirectedPagesPath} (${this.state.redirectedPages.length} pages)`
      );
    } else {
      logger.info('No redirected pages to save');
    }
  }
}

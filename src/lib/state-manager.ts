// src/lib/state-manager.ts

import * as path from 'path';
import { CrawlConfig, CrawlState, PageData, LinkRelation } from '@/types';
import { ensureDir, saveFile, readFile, fileExists } from './file-utils';
import { Logger } from './logger';
// import { formatError } from './error-formatter'; // TODO: Add error formatting utility if needed

const logger = new Logger();

export class StateManager {
  private stateDir: string;
  private stateFile: string;
  private state: CrawlState;

  constructor(config: CrawlConfig) {
    this.stateDir = config.stateDir;
    this.stateFile = path.join(this.stateDir, 'crawl-state.json');
    this.state = {
      queued: [],
      completed: new Map(),
      failed: new Map(),
      brokenLinks: [],
      externalLinks: new Set(),
      linkRelations: [],
      lastProcessed: new Date(),
    };
  }

  /**
   * Initialize state manager and load existing state if available
   */
  async initialize(): Promise<void> {
    await ensureDir(this.stateDir);

    if (await fileExists(this.stateFile)) {
      try {
        const content = await readFile(this.stateFile);
        const data = JSON.parse(content);

        // Convert arrays back to Maps and Sets
        this.state = {
          queued: data.queued || [],
          completed: new Map(data.completed || []),
          failed: new Map(data.failed || []),
          brokenLinks: data.brokenLinks || [],
          externalLinks: new Set(data.externalLinks || []),
          linkRelations: data.linkRelations || [],
          lastProcessed: data.lastProcessed ? new Date(data.lastProcessed) : new Date(),
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
      // Convert Maps and Sets to arrays for JSON serialization
      const data = {
        queued: this.state.queued,
        completed: Array.from(this.state.completed.entries()),
        failed: Array.from(this.state.failed.entries()),
        brokenLinks: this.state.brokenLinks,
        externalLinks: Array.from(this.state.externalLinks),
        linkRelations: this.state.linkRelations,
        lastProcessed: this.state.lastProcessed.toISOString(),
      };

      await saveFile(this.stateFile, JSON.stringify(data, null, 2));
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
    };
    await this.saveState();
    logger.info('State cleared');
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
   * Save link relations to a separate JSON file for easy analysis
   * Format: { targetUrl: [sourceUrl1, sourceUrl2, ...] }
   */
  async saveLinkRelations(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    const { ensureDir } = await import('./file-utils');

    const linkRelationsPath = path.join(this.stateDir, 'link-relations.json');
    await ensureDir(this.stateDir);

    // Convert to hierarchical format: targetUrl -> [sourceUrls]
    const hierarchicalRelations: Record<string, string[]> = {};

    this.state.linkRelations.forEach((relation) => {
      if (!hierarchicalRelations[relation.targetUrl]) {
        hierarchicalRelations[relation.targetUrl] = [];
      }
      // Avoid duplicate source URLs for the same target
      if (!hierarchicalRelations[relation.targetUrl].includes(relation.sourceUrl)) {
        hierarchicalRelations[relation.targetUrl].push(relation.sourceUrl);
      }
    });

    // Sort by target URL for better readability
    const sortedRelations: Record<string, string[]> = {};
    Object.keys(hierarchicalRelations)
      .sort()
      .forEach((key) => {
        sortedRelations[key] = hierarchicalRelations[key].sort();
      });

    await fs.promises.writeFile(
      linkRelationsPath,
      JSON.stringify(sortedRelations, null, 2),
      'utf-8'
    );
    logger.info(
      `Link relations saved to ${linkRelationsPath} (${Object.keys(sortedRelations).length} target URLs)`
    );
  }
}

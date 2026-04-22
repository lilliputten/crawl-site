#!/usr/bin/env ts-node

import { loadConfig, validateConfig } from '@/config';
import { DelayManager } from '@/lib/delay-manager';
import { StateManager } from '@/lib/state-manager';
import { WebCrawler } from '@/lib/web-crawler';
import { Logger } from '@/lib/logger';

const logger = new Logger();

async function main() {
  try {
    logger.info('=== Site Crawler Starting ===');

    // Load and validate configuration
    const config = loadConfig();
    validateConfig(config);

    logger.debug('Configuration loaded:', {
      siteUrl: config.siteUrl,
      crawlDelay: config.crawlDelay,
      maxRetries: config.maxRetries,
      dest: config.dest,
    });

    // Initialize components
    const delayManager = new DelayManager(config);
    const stateManager = new StateManager(config);
    await stateManager.initialize();

    // Create crawler and run
    const crawler = new WebCrawler(config, delayManager, stateManager);
    await crawler.crawl();

    // Save link relations report
    await stateManager.saveLinkRelations();

    logger.info('=== Crawl Complete ===');
  } catch (error) {
    logger.error(`Crawl failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();

#!/usr/bin/env ts-node

import { loadConfig, validateConfig } from '../config';
import { DelayManager } from '../lib/delay-manager';
import { StateManager } from '../lib/state-manager';
import { SiteScanner } from '../lib/site-scanner';
import { Logger } from '../lib/logger';

const logger = new Logger();

async function main() {
  try {
    logger.info('=== Site Scanner Starting ===');
    
    // Load and validate configuration
    const config = loadConfig();
    validateConfig(config);
    
    logger.debug('Configuration loaded:', {
      siteUrl: config.siteUrl,
      sitemapCount: config.sitemapUrls.length,
      crawlDelay: config.crawlDelay,
      dest: config.dest,
    });

    // Initialize components
    const delayManager = new DelayManager(config);
    const stateManager = new StateManager(config);
    await stateManager.initialize();

    // Clear previous scan data if starting fresh
    await stateManager.clearState();

    // Create scanner and run
    const scanner = new SiteScanner(config, delayManager, stateManager);
    const siteMap = await scanner.scan();

    logger.info(`=== Scan Complete: ${siteMap.urls.length} pages found ===`);
  } catch (error) {
    logger.error('Scan failed:', error);
    process.exit(1);
  }
}

main();

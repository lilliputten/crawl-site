#!/usr/bin/env ts-node

import { loadConfig, validateConfig } from '@/config';
import { DelayManager } from '@/lib/delay-manager';
import { StateManager, configureLogger as configureStateManagerLogger } from '@/lib/state-manager';
import { WebCrawler, configureLogger as configureWebCrawlerLogger } from '@/lib/web-crawler';
import { configureLogger as configureRobotsParserLogger } from '@/lib/robots-parser';
import { configureLogger as configureUrlExcluderLogger } from '@/lib/url-excluder';
import { Logger } from '@/lib/logger';

async function main() {
  try {
    // Load and validate configuration
    const config = await loadConfig();
    validateConfig(config);

    // Configure logger with settings from config
    const logger = new Logger(config.logLevel, config.noColor);
    configureWebCrawlerLogger(config);
    configureStateManagerLogger(config);
    configureRobotsParserLogger(config);
    configureUrlExcluderLogger(config);

    logger.info('=== Site Crawler Starting ===');

    logger.debug('Configuration loaded:', {
      siteUrl: config.siteUrl,
      crawlDelay: config.crawlDelay,
      maxRetries: config.maxRetries,
      dest: config.dest,
      excludeRules: config.exclude.length,
      noColor: config.noColor,
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
    console.error(`Crawl failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();

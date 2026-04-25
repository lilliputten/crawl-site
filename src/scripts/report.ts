#!/usr/bin/env ts-node

import { loadConfig, validateConfig } from '@/config';
import { DelayManager } from '@/lib/delay-manager';
import { StateManager, configureLogger as configureStateManagerLogger } from '@/lib/state-manager';
import { SiteScanner, configureLogger as configureSiteScannerLogger } from '@/lib/site-scanner';
import { configureLogger as configureRobotsParserLogger } from '@/lib/robots-parser';
import { configureLogger as configureSitemapParserLogger } from '@/lib/sitemap-parser';
import { configureLogger as configureUrlExcluderLogger } from '@/lib/url-excluder';
import { Logger } from '@/lib/logger';

async function main() {
  let scanner: SiteScanner | null = null;

  try {
    // Load and validate configuration
    const config = await loadConfig();
    validateConfig(config);

    // Configure logger with settings from config
    const logger = new Logger(config.logLevel, config.noColor);
    configureSiteScannerLogger(config);
    configureStateManagerLogger(config);
    configureRobotsParserLogger(config);
    configureSitemapParserLogger(config);
    configureUrlExcluderLogger(config);

    logger.info('=== Report Regeneration Starting ===');

    logger.debug('Configuration loaded:', {
      siteUrl: config.siteUrl,
      sitemapCount: config.sitemapUrls.length,
      crawlDelay: config.crawlDelay,
      dest: config.dest,
      excludeRules: config.exclude.length,
      noColor: config.noColor,
    });

    // Initialize components
    const delayManager = new DelayManager(config);
    const stateManager = new StateManager(config);
    await stateManager.initialize();

    // Create scanner - this will load existing state
    scanner = new SiteScanner(config, delayManager, stateManager);

    logger.info('Loaded existing scan data, regenerating report and statistics...');

    // Call shutdown to trigger saveFinalResults which regenerates all files including report
    await scanner.shutdown();

    logger.info('=== Report Regeneration Complete ===');
    logger.info(`Report saved to: ${config.stateDir}/report.md`);
  } catch (error) {
    console.error(`Report regeneration failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();

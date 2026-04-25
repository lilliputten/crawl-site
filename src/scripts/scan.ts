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
  let isShuttingDown = false;

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

    logger.info('=== Site Scanner Starting ===');

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

    // Create scanner
    scanner = new SiteScanner(config, delayManager, stateManager);

    // Setup graceful shutdown handler for Ctrl-C (SIGINT)
    const handleShutdown = async (signal: string) => {
      if (isShuttingDown) {
        logger.warn('Already shutting down, please wait...');
        return;
      }

      isShuttingDown = true;
      logger.info(`\nReceived ${signal} signal, initiating graceful shutdown...`);

      if (scanner) {
        await scanner.shutdown();
      }

      logger.info('Shutdown complete');
      process.exit(0);
    };

    // Listen for termination signals
    process.on('SIGINT', () => handleShutdown('SIGINT')); // Ctrl-C
    process.on('SIGTERM', () => handleShutdown('SIGTERM')); // Kill command

    // Run the scan
    const siteMap = await scanner.scan();

    logger.info(`=== Scan Complete: ${siteMap.urls.length} pages found ===`);
  } catch (error) {
    console.error(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();

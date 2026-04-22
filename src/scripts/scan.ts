#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, validateConfig } from '@/config';
import { DelayManager } from '@/lib/delay-manager';
import { SiteScanner, configureLogger as configureSiteScannerLogger } from '@/lib/site-scanner';
import { configureLogger as configureRobotsParserLogger } from '@/lib/robots-parser';
import { configureLogger as configureSitemapParserLogger } from '@/lib/sitemap-parser';
import { configureLogger as configureUrlExcluderLogger } from '@/lib/url-excluder';
import { Logger } from '@/lib/logger';

async function main() {
  try {
    // Load and validate configuration
    const config = await loadConfig();
    validateConfig(config);

    // Configure logger with settings from config
    const logger = new Logger(config.logLevel, config.noColor);
    configureSiteScannerLogger(config);
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

    // Clear previous scan data if starting fresh
    const stateFile = path.join(config.stateDir, 'sitemap.yaml');
    if (fs.existsSync(stateFile)) {
      await fs.promises.unlink(stateFile);
    }

    // Create scanner and run
    const scanner = new SiteScanner(config, delayManager);
    const siteMap = await scanner.scan();

    logger.info(`=== Scan Complete: ${siteMap.urls.length} pages found ===`);
  } catch (error) {
    console.error(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();

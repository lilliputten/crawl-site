#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, validateConfig } from '@/config';
import { DelayManager } from '@/lib/delay-manager';
import { SiteScanner } from '@/lib/site-scanner';
import { Logger } from '@/lib/logger';

const logger = new Logger();

async function main() {
  try {
    logger.info('=== Site Scanner Starting ===');

    // Load and validate configuration
    const config = await loadConfig();
    validateConfig(config);

    logger.debug('Configuration loaded:', {
      siteUrl: config.siteUrl,
      sitemapCount: config.sitemapUrls.length,
      crawlDelay: config.crawlDelay,
      dest: config.dest,
      excludeRules: config.exclude.length,
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
    logger.error(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();

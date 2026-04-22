// src/lib/url-excluder.ts

import { ExcludeRule, CrawlConfig } from '@/types';
import { Logger } from './logger';

const logger = new Logger();

/**
 * Check if a URL matches an exclusion rule
 */
function matchesRule(url: string, rule: ExcludeRule): boolean {
  const { mode, string } = rule;

  try {
    // Extract pathname for path-based matching
    let urlPath = url;
    try {
      const urlObj = new URL(url);
      urlPath = urlObj.pathname + urlObj.search + urlObj.hash;
    } catch {
      // If URL parsing fails, use the full URL as-is
    }

    switch (mode) {
      case 'prefix':
        // Check both full URL and pathname
        return url.startsWith(string) || urlPath.startsWith(string);

      case 'suffix':
        // Check both full URL and pathname
        return url.endsWith(string) || urlPath.endsWith(string);

      case 'contains':
        // Check both full URL and pathname
        return url.includes(string) || urlPath.includes(string);

      case 'exact':
        // Check both full URL and pathname
        return url === string || urlPath === string;

      case 'regex':
        const regex = new RegExp(string);
        // Check both full URL and pathname
        return regex.test(url) || regex.test(urlPath);

      default:
        logger.warn(`Unknown exclusion mode: ${mode}`);
        return false;
    }
  } catch (error) {
    logger.error(
      `Error matching URL against rule (${mode}: ${string}): ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Check if a URL should be excluded based on rules
 */
export function isUrlExcluded(url: string, rules: ExcludeRule[], config?: CrawlConfig): boolean {
  if (!rules || rules.length === 0) {
    return false;
  }

  for (const rule of rules) {
    if (matchesRule(url, rule)) {
      // Only log if showExclusionMessages is true (default: false)
      if (!!config?.showExclusionMessages) {
        logger.info(`⊘ URL excluded by rule [${rule.mode}: "${rule.string}"]: ${url}`);
      }
      return true;
    }
  }

  return false;
}

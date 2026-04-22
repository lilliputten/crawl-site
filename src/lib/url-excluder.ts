// src/lib/url-excluder.ts

import { ExcludeRule } from '@/types';
import { Logger } from './logger';

const logger = new Logger();

/**
 * Check if a URL matches an exclusion rule
 */
function matchesRule(url: string, rule: ExcludeRule): boolean {
  const { mode, string } = rule;

  try {
    switch (mode) {
      case 'prefix':
        return url.startsWith(string);

      case 'suffix':
        return url.endsWith(string);

      case 'contains':
        return url.includes(string);

      case 'exact':
        return url === string;

      case 'regex':
        const regex = new RegExp(string);
        return regex.test(url);

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
export function isUrlExcluded(url: string, rules: ExcludeRule[]): boolean {
  if (!rules || rules.length === 0) {
    return false;
  }

  for (const rule of rules) {
    if (matchesRule(url, rule)) {
      logger.debug(`URL excluded by rule [${rule.mode}: ${rule.string}]: ${url}`);
      return true;
    }
  }

  return false;
}

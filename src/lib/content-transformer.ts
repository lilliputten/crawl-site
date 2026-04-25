// src/lib/content-transformer.ts

import { ContentTransformRule, CrawlConfig } from '@/types';
import { Logger } from './logger';

const logger = new Logger();

/**
 * Configure the module-level logger with settings from config
 */
export function configureLogger(config: CrawlConfig): void {
  logger.configure({ logLevel: config.logLevel, noColor: config.noColor });
}

/**
 * Apply a single transformation rule to content
 */
function applyRule(content: string, rule: ContentTransformRule): string {
  const { find, replace, flags, isRegex } = rule;

  try {
    if (isRegex) {
      // Use regex replacement
      const regexFlags = flags || 'g'; // Default to global replacement
      const regex = new RegExp(find, regexFlags);
      return content.replace(regex, replace);
    } else {
      // Use simple string replacement (replace all occurrences)
      // Split and join to replace all instances
      return content.split(find).join(replace);
    }
  } catch (error) {
    logger.error(
      `Error applying transformation rule (find: "${find}", replace: "${replace}"): ${error instanceof Error ? error.message : String(error)}`
    );
    return content; // Return original content if transformation fails
  }
}

/**
 * Apply all transformation rules to content
 */
export function transformContent(content: string, rules: ContentTransformRule[]): string {
  if (!rules || rules.length === 0) {
    return content;
  }

  let transformedContent = content;
  let appliedCount = 0;

  for (const rule of rules) {
    const beforeLength = transformedContent.length;
    transformedContent = applyRule(transformedContent, rule);
    const afterLength = transformedContent.length;

    // Check if any replacements were made
    if (beforeLength !== afterLength || (rule.isRegex && rule.find.includes('|'))) {
      appliedCount++;
      logger.debug(`Applied transformation rule: "${rule.find}" -> "${rule.replace}"`);
    }
  }

  if (appliedCount > 0) {
    logger.debug(`Applied ${appliedCount} transformation rule(s) to content`);
  }

  return transformedContent;
}

// src/lib/robots-parser.ts

import axios from 'axios';
import { CrawlConfig, RobotsTxt } from '@/types';
import { Logger } from './logger';

const logger = new Logger();

/**
 * Fetch and parse robots.txt
 */
export async function fetchRobotsTxt(
  siteUrl: string,
  config: CrawlConfig
): Promise<RobotsTxt | null> {
  try {
    const baseUrl = new URL(siteUrl);
    const robotsUrl = `${baseUrl.protocol}//${baseUrl.host}/robots.txt`;

    const response = await axios.get(robotsUrl, {
      timeout: config.requestTimeout,
      headers: {
        'User-Agent': config.userAgent,
      },
    });

    return parseRobotsTxt(response.data);
  } catch (error) {
    logger.warn('Failed to fetch robots.txt:', error);
    return null;
  }
}

/**
 * Parse robots.txt content
 */
function parseRobotsTxt(content: string): RobotsTxt {
  const result: RobotsTxt = {
    allowed: [],
    disallowed: [],
    sitemaps: [],
  };

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('#') || !trimmed) {
      continue;
    }

    if (trimmed.toLowerCase().startsWith('disallow:')) {
      const path = trimmed.substring(9).trim();
      if (path) {
        result.disallowed.push(path);
      }
    } else if (trimmed.toLowerCase().startsWith('allow:')) {
      const path = trimmed.substring(6).trim();
      if (path) {
        result.allowed.push(path);
      }
    } else if (trimmed.toLowerCase().startsWith('sitemap:')) {
      const sitemap = trimmed.substring(8).trim();
      if (sitemap) {
        result.sitemaps.push(sitemap);
      }
    }
  }

  return result;
}

/**
 * Check if URL is allowed by robots.txt
 */
export function isUrlAllowed(url: string, robotsTxt: RobotsTxt | null): boolean {
  if (!robotsTxt) {
    return true; // If no robots.txt, allow everything
  }

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Check disallowed paths
    for (const pattern of robotsTxt.disallowed) {
      if (matchesPattern(pathname, pattern)) {
        // Check if explicitly allowed
        for (const allowed of robotsTxt.allowed) {
          if (matchesPattern(pathname, allowed)) {
            return true;
          }
        }
        return false;
      }
    }

    return true;
  } catch {
    return true; // If URL parsing fails, allow it
  }
}

/**
 * Check if a path matches a robots.txt pattern
 */
function matchesPattern(path: string, pattern: string): boolean {
  // Simple prefix matching
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  return path.startsWith(pattern);
}

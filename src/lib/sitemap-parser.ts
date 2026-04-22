// src/lib/sitemap-parser.ts

import axios from 'axios';
import { JSDOM } from 'jsdom';
import { parseStringPromise } from 'xml2js';
import { CrawlConfig, PageData } from '@/types';
import { Logger } from './logger';
import { decodeUrl, normalizeUrl } from './url-utils';
import { formatAxiosError } from './error-utils';

const logger = new Logger();

/**
 * Configure the module-level logger with settings from config
 */
export function configureLogger(config: CrawlConfig): void {
  logger.configure({ logLevel: config.logLevel, noColor: config.noColor });
}

export interface SitemapEntry {
  url: string;
  title?: string;
  lastModified?: Date;
}

/**
 * Parse sitemap URLs from XML or HTML format
 */
export async function parseSitemapUrls(
  sitemapUrl: string,
  config: CrawlConfig
): Promise<PageData[]> {
  try {
    const response = await axios.get(sitemapUrl, {
      timeout: config.requestTimeout,
      headers: {
        'User-Agent': config.userAgent,
      },
    });

    const contentType = String(response.headers['content-type'] || '');

    if (contentType.includes('xml') || sitemapUrl.endsWith('.xml')) {
      return await parseXmlSitemap(response.data);
    } else if (contentType.includes('html') || sitemapUrl.endsWith('.html')) {
      return await parseHtmlSitemap(response.data, sitemapUrl);
    } else {
      // Try XML first, then HTML
      try {
        return await parseXmlSitemap(response.data);
      } catch {
        return await parseHtmlSitemap(response.data, sitemapUrl);
      }
    }
  } catch (error) {
    logger.error(`Failed to parse sitemap ${sitemapUrl}: ${formatAxiosError(error)}`);
    throw error;
  }
}

/**
 * Parse XML sitemap
 */
async function parseXmlSitemap(xmlContent: string): Promise<PageData[]> {
  try {
    const result = await parseStringPromise(xmlContent);
    const pages: PageData[] = [];

    // Handle sitemap index (nested sitemaps)
    if (result.sitemapindex && result.sitemapindex.sitemap) {
      const sitemaps = result.sitemapindex.sitemap;
      for (const sitemap of sitemaps) {
        if (sitemap.loc && sitemap.loc[0]) {
          const sitemapUrl = sitemap.loc[0];
          // Recursively parse nested sitemaps
          try {
            const nestedPages = await fetchAndParseSitemap(sitemapUrl);
            pages.push(...nestedPages);
          } catch (error) {
            logger.warn(`Failed to fetch nested sitemap: ${sitemapUrl}`);
          }
        }
      }
    }
    // Handle regular URL set
    else if (result.urlset && result.urlset.url) {
      const urls = result.urlset.url;
      for (const url of urls) {
        if (url.loc && url.loc[0]) {
          const pageData: PageData = {
            url: normalizeUrl(decodeUrl(url.loc[0])),
            title: '',
            lastModified: url.lastmod ? new Date(url.lastmod[0]) : undefined,
          };
          pages.push(pageData);
        }
      }
    }

    return pages;
  } catch (error) {
    logger.error(
      `Failed to parse XML sitemap: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Parse HTML sitemap
 */
async function parseHtmlSitemap(htmlContent: string, baseUrl: string): Promise<PageData[]> {
  try {
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    const pages: PageData[] = [];

    // Find all links in the HTML
    const links = document.querySelectorAll('a[href]');

    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        try {
          const fullUrl = new URL(href, baseUrl).toString();
          const title = link.textContent?.trim() || '';

          pages.push({
            url: normalizeUrl(decodeUrl(fullUrl)),
            title,
          });
        } catch (error) {
          // Skip invalid URLs
        }
      }
    });

    return pages;
  } catch (error) {
    logger.error(
      `Failed to parse HTML sitemap: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

/**
 * Fetch and parse sitemap (helper function)
 */
async function fetchAndParseSitemap(sitemapUrl: string): Promise<PageData[]> {
  try {
    const response = await axios.get(sitemapUrl, { timeout: 30000 });
    const contentType = String(response.headers['content-type'] || '');

    if (contentType.includes('xml') || sitemapUrl.endsWith('.xml')) {
      return await parseXmlSitemap(response.data);
    } else {
      return await parseHtmlSitemap(response.data, sitemapUrl);
    }
  } catch (error) {
    logger.warn(`Failed to fetch sitemap: ${sitemapUrl}`);
    return [];
  }
}

/**
 * Extract page title from HTML content
 */
export function extractTitle(html: string): string {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const titleElement = document.querySelector('title');
    return titleElement?.textContent?.trim() || '';
  } catch (error) {
    return '';
  }
}

import * as cheerio from 'cheerio';
import { SitemapEntry } from '../types';

export function extractTitle(html: string): string | undefined {
  const $ = cheerio.load(html);
  return $('title').first().text().trim() || undefined;
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        links.push(absoluteUrl);
      } catch {
        // Skip invalid URLs
      }
    }
  });

  return [...new Set(links)]; // Remove duplicates
}

export function extractMetaInfo(html: string): Partial<SitemapEntry> {
  const $ = cheerio.load(html);
  const info: Partial<SitemapEntry> = {};

  // Extract title
  info.title = $('title').first().text().trim();

  // Extract last modified from meta tags if available
  const lastModified =
    $('meta[property="article:modified_time"]').attr('content') ||
    $('meta[name="last-modified"]').attr('content');
  if (lastModified) {
    info.lastModified = new Date(lastModified);
  }

  // Extract priority from meta tags if available
  const priorityStr = $('meta[name="priority"]').attr('content');
  if (priorityStr) {
    const priority = parseFloat(priorityStr);
    if (!isNaN(priority)) {
      info.priority = priority;
    }
  }

  return info;
}

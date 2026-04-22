// src/lib/url-utils.ts

import * as path from 'path';

/**
 * Decode URL-encoded characters, especially Cyrillic characters
 */
export function decodeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Decode pathname to handle Cyrillic and other unicode characters
    const decodedPathname = decodeURIComponent(urlObj.pathname);

    // Reconstruct URL with decoded pathname
    return `${urlObj.protocol}//${urlObj.host}${decodedPathname}${urlObj.search}${urlObj.hash}`;
  } catch (error) {
    // If URL parsing fails, try to decode the string directly
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  }
}

/**
 * Normalize URL to ensure consistent format
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Clean up any double slashes in the pathname first
    let pathname = urlObj.pathname.replace(/\/{2,}/g, '/');
    
    // Remove trailing slash except for root
    if (pathname !== '/' && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    return `${urlObj.protocol}//${urlObj.host}${pathname}`;
  } catch (error) {
    return url;
  }
}

/**
 * Check if URL is valid
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert URL to file path, preserving Cyrillic characters
 */
export function urlToFilePath(url: string, baseUrl: string, destDir: string): string {
  const urlObj = new URL(url);
  const baseObj = new URL(baseUrl);

  // Get relative path
  let relativePath = urlObj.pathname;
  if (relativePath.startsWith('/')) {
    relativePath = relativePath.substring(1);
  }

  // Handle index files
  if (relativePath === '' || relativePath.endsWith('/')) {
    relativePath += 'index.html';
  } else if (!relativePath.endsWith('.html')) {
    // Add .html extension for files without extension
    relativePath += '.html';
  }

  // Decode any encoded characters (especially Cyrillic)
  relativePath = decodeURIComponent(relativePath);

  return path.join(destDir, baseObj.hostname, relativePath);
}

/**
 * Extract domain from URL
 */
export function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

/**
 * Check if URL belongs to the same domain
 */
export function isSameDomain(url: string, baseUrl: string): boolean {
  try {
    const urlObj = new URL(url);
    const baseObj = new URL(baseUrl);
    return urlObj.hostname === baseObj.hostname;
  } catch {
    return false;
  }
}

/**
 * Decode percent-encoded URL, preserving Cyrillic characters
 */
export function decodeUrl(encodedUrl: string): string {
  try {
    // Decode the URL properly, including Cyrillic characters
    return decodeURIComponent(encodedUrl);
  } catch (error) {
    console.error(`Error decoding URL: ${encodedUrl}`, error);
    return encodedUrl;
  }
}

/**
 * Normalize URL - remove trailing slashes, lowercase, etc.
 */
export function normalizeUrl(baseUrl: string, relativeUrl: string): string {
  try {
    const absolute = new URL(relativeUrl, baseUrl);
    return absolute.href;
  } catch (error) {
    console.error(`Invalid URL: ${relativeUrl}`);
    return '';
  }
}

/**
 * Check if URL is valid and absolute
 */
export function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if URL belongs to the same domain
 */
export function isSameDomain(urlString: string, baseUrl: string): boolean {
  try {
    const url1 = new URL(urlString);
    const url2 = new URL(baseUrl);
    return url1.hostname === url2.hostname;
  } catch {
    return false;
  }
}

/**
 * Convert URL to file path (preserving Cyrillic)
 */
export function urlToPath(urlString: string, destFolder: string): string {
  const parsed = new URL(urlString);
  let pathname = decodeUrl(parsed.pathname);

  // Remove leading slash
  if (pathname.startsWith('/')) {
    pathname = pathname.substring(1);
  }

  // If it's a directory or ends with slash, add index.html
  if (pathname.endsWith('/') || pathname === '') {
    pathname += 'index.html';
  }

  // Ensure .html extension for files without extension
  if (!pathname.includes('.') || pathname.endsWith('/')) {
    if (!pathname.endsWith('.html')) {
      pathname += '.html';
    }
  }

  const fullPath = `${destFolder}/${pathname}`;
  return fullPath;
}

/**
 * Extract domain from URL
 */
export function getDomain(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    return parsed.hostname;
  } catch {
    return '';
  }
}

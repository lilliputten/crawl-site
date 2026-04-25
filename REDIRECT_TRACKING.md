# Redirect Tracking Feature

## Overview

The scan code now maintains a list of pages that return redirect status codes (301, 302, etc.) and includes information about the redirect destination. Content is NOT saved for these redirected pages.

## Implementation Details

### 1. Type Definitions (`src/types.ts`)

Added new interface and state tracking:

```typescript
export interface RedirectedPage {
  url: string; // The original URL that was requested
  statusCode: number; // The redirect status code (301, 302, etc.)
  redirectUrl: string; // The URL it redirects to
  timestamp: Date; // When the redirect was detected
}

export interface CrawlState {
  // ... existing fields ...
  redirectedPages: RedirectedPage[]; // Pages that returned redirect status codes
}
```

### 2. State Manager Updates (`src/lib/state-manager.ts`)

Added methods to manage redirected pages:

- `addRedirectedPage(url, statusCode, redirectUrl)`: Track a redirect
- `getRedirectedPages()`: Retrieve all tracked redirects
- `saveRedirectedPages()`: Save redirects to `redirected-pages.yaml`

### 3. Site Scanner Updates (`src/lib/site-scanner.ts`)

#### HTTP Request Configuration

Modified axios configuration to detect redirects:

```typescript
const response = await axios.get(url, {
  timeout: this.config.requestTimeout,
  headers,
  maxRedirects: 0, // Don't follow redirects automatically
  validateStatus: (status) => status < 500, // Accept all status codes < 500
});
```

#### Redirect Detection Logic

When a 3xx status code is detected:

1. **Extract redirect URL** from the `Location` header
2. **Log the redirect**: `↪ Redirect detected: <url> -> <redirectUrl> (301)`
3. **Track in memory**: Add to `redirectedPages` array
4. **Skip content saving**: No HTML file is saved for redirected pages
5. **Queue redirect target**: If internal and not excluded, add to crawl queue
6. **Mark as visited**: Prevent re-processing

```typescript
if (response.status >= 300 && response.status < 400) {
  const redirectUrl = response.headers['location'];
  logger.info(`↪ Redirect detected: ${url} -> ${redirectUrl} (${response.status})`);

  // Track but don't save content
  this.redirectedPages.push({
    url: normalized,
    statusCode: response.status,
    redirectUrl: absoluteRedirectUrl,
  });

  // Skip further processing
  continue;
}
```

### 4. Data Persistence

Redirect information is saved **immediately** when detected and also persisted to multiple locations:

1. **Immediate Save**: When a redirect is detected, `saveRedirectedPages()` is called immediately to prevent data loss if the scan is interrupted
2. **`crawl-data/redirected-pages.yaml`**: Dedicated file with redirect details
3. **`crawl-data/crawl-state.yaml`**: Complete state including `redirectedPages`

Example `redirected-pages.yaml`:

```
- url: "https://zdkvartira.ru/часто-задаваемы-вопросы/вы-можете-получить-скидку-у-застройщика/"
  statusCode: 301
  redirectUrl: "https://zdkvartira.ru/faq/discount/"
  timestamp: "2026-04-25T02:44:10.000Z"
```

**Note**: The [redirectUrl](file://d:\Work\Myhoster\260306-zdkvartira\crawl-pages\src\types.ts#L80-L80) is stored in **decoded format** for better readability. For example, instead of:

```yaml
redirectUrl: 'https://zdkvartira.ru/%D0%BE%D0%B1%D1%8A%D0%B5%D0%BA%D1%82%D1%8B/%D0%B3%D0%BE%D1%80%D0%BE%D0%B4%D1%81%D0%BA%D0%B0%D1%8F-%D0%BD%D0%B5%D0%B4%D0%B2%D0%B8%D0%B6%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D1%8C/'
```

You'll see the human-readable version:

```yaml
redirectUrl: 'https://zdkvartira.ru/объекты/городская-недвижимость/'
```

### 5. Statistics

At the end of scanning, summary includes redirect count:

```
Scan complete. Found 150 pages
Links summary: 145 internal, 3 broken, 12 external
Excluded URLs: 8
Redirected pages: 5
```

## Example Use Case

For the page mentioned in the requirements:

- **URL**: `https://zdkvartira.ru/часто-задаваемы-вопросы/вы-можете-получить-скидку-у-застройщика/`
- **Status**: 301 (Moved Permanently)
- **Action**:
  - ✅ Tracked in `redirected-pages.yaml`
  - ❌ No content saved to disk
  - ✅ Redirect target queued for crawling (if internal)

## Benefits

1. **Complete Site Analysis**: Know which pages redirect and where
2. **SEO Insights**: Identify permanent (301) vs temporary (302) redirects
3. **Storage Efficiency**: Don't waste space on redirect responses
4. **Link Graph Accuracy**: Understand actual navigation paths
5. **Debugging**: Track down redirect chains and loops
6. **Readable Saved Content**: HTML files saved to disk have decoded URLs in href/src attributes for better readability

### HTML Content Decoding

When saving page content to disk, the scanner automatically decodes URL-encoded characters in `href` and `src` attributes:

**Before** (URL-encoded in saved HTML):

```html
<a href="/%D0%BE-%D0%BA%D0%BE%D0%BC%D0%BF%D0%B0%D0%BD%D0%B8%D0%B8/">About Company</a>
<img src="/images/%D0%BB%D0%BE%D0%B3%D0%BE.png" alt="Logo" />
```

**After** (Decoded in saved HTML):

```html
<a href="/о-компании/">About Company</a> <img src="/images/лого.png" alt="Logo" />
```

This makes the saved HTML files much easier to read and debug, especially for sites with Cyrillic, Chinese, or other Unicode characters in their URLs.

## Testing

To verify the feature works:

```bash
pnpm scan
```

After scanning, check:

- `crawl-data/redirected-pages.yaml` - List of all redirects
- `crawl-data/crawl-state.yaml` - Contains `redirectedPages` array
- Console output shows `↪ Redirect detected:` messages

### Graceful Shutdown

The scanner now supports graceful shutdown when you press **Ctrl-C** (SIGINT) or send a termination signal (SIGTERM):

1. Press **Ctrl-C** during scanning
2. The scanner will immediately call `saveFinalResults()` to persist all data
3. All results (sitemap, broken links, redirected pages, link relations, etc.) are saved
4. The process exits cleanly with status code 0

This ensures no data is lost if you need to interrupt a long-running scan!

## Notes

- Relative redirect URLs are resolved to absolute URLs before tracking
- Only status codes 300-399 are considered redirects
- Redirect targets are added to the crawl queue if they're internal URLs
- The feature respects exclusion rules (redirected pages matching exclude patterns are still tracked)

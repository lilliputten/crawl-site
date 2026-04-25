# Crawl Stage Removal - Migration Guide

**Date**: 2026-04-25  
**Version**: 0.0.2 → 0.0.3 (pending)

## Overview

The two-stage process (Scan + Crawl) has been consolidated into a **single self-sufficient scan stage**. The `scan` command now handles everything: URL discovery, link analysis, and content downloading.

## What Changed

### Removed Components

1. **Deleted File**: `src/scripts/crawl.ts` - The standalone crawl script
2. **Removed Scripts** from `package.json`:
   - ❌ `pnpm crawl`
   - ❌ `pnpm crawl-build`
   - ❌ `pnpm start` (which ran both scan and crawl)
3. **Updated Scripts** in `package.json`:
   - ✅ `pnpm start` → Now just runs `pnpm scan`
   - ✅ `pnpm start-build` → Now just runs build + scan

### Enhanced Scan Functionality

The [`SiteScanner`](file://d:\Work\Myhoster\260306-zdkvartira\crawl-pages\src\lib\site-scanner.ts) class now includes all functionality that was previously in [`WebCrawler`](file://d:\Work\Myhoster\260306-zdkvartira\crawl-pages\src\lib\web-crawler.ts):

✅ **URL Discovery** (from sitemap and link extraction)  
✅ **Content Downloading** (saves HTML to `crawled-content/`)  
✅ **Link Analysis** (internal, external, broken links)  
✅ **Redirect Tracking** (3xx status codes)  
✅ **State Management** (resume capability)  
✅ **HTML URL Decoding** (decoded href/src attributes in saved files)

## Migration Steps

### For Users

**Before** (Two-stage process):

```bash
pnpm scan    # Stage 1: Discover URLs
pnpm crawl   # Stage 2: Download content
```

**After** (Single-stage process):

```bash
pnpm scan    # Does everything: discover + download
```

That's it! Just run `pnpm scan` and it handles everything automatically.

### For Developers

If you have custom scripts or integrations that called the crawl stage:

1. **Replace `pnpm crawl` with `pnpm scan`**
2. **Remove any references to `WebCrawler` class** - Use [`SiteScanner`](file://d:\Work\Myhoster\260306-zdkvartira\crawl-pages\src\lib\site-scanner.ts) instead
3. **Update CI/CD pipelines** to use single-stage scanning

## Benefits

### 1. Simplified Workflow

- One command instead of two
- No need to wait for scan to complete before starting crawl
- Easier to understand and explain

### 2. Better Performance

- No duplicate HTTP requests (scan already downloaded content)
- Reduced I/O operations
- Faster overall completion time

### 3. Improved Reliability

- Single point of failure instead of two stages
- Atomic operation - either everything succeeds or nothing
- Easier error handling and recovery

### 4. Consistent State

- No risk of mismatch between scan results and crawled content
- All data saved together ensures consistency
- Simpler state management

## Technical Details

### What SiteScanner Now Does

During the scan process, for each URL:

1. **Fetches the page** (with proper delay management)
2. **Detects redirects** (3xx status codes) and tracks them
3. **Extracts links** (internal, external, broken)
4. **Saves HTML content** to `crawled-content/` directory
5. **Decodes URLs** in href/src attributes for readability
6. **Updates state** periodically (every 10 pages)
7. **Handles errors** with exponential backoff retry

### Graceful Shutdown

Press **Ctrl-C** at any time during scanning:

- ✅ All progress is saved immediately
- ✅ Can resume from where you left off
- ✅ No data loss

### Output Files

All output remains the same, generated in a single pass:

- `crawl-default/sitemap.yaml` - Discovered URLs
- `crawl-default/crawl-state.yaml` - Current progress state
- `crawl-default/broken-links.yaml` - Failed URLs
- `crawl-default/redirected-pages.yaml` - Redirect tracking
- `crawl-default/link-relations.yaml` - Link relationships
- `crawl-default/internal-link-relations.yaml` - Internal links
- `crawl-default/external-link-relations.yaml` - External links
- `crawled-content/` - Downloaded HTML files

## FAQ

### Q: Can I still use the old two-stage process?

**A**: No, the crawl stage has been completely removed. Use `pnpm scan` for everything.

### Q: Will my existing crawled content be affected?

**A**: No, existing content in `crawled-content/` is preserved. The scanner will skip already-downloaded pages.

### Q: How do I resume an interrupted scan?

**A**: Just run `pnpm scan` again. It automatically detects existing state and resumes from where it left off.

### Q: Can I scan without downloading content?

**A**: Currently no - the scan always downloads content. If you need discovery-only mode, this could be added as a future feature flag.

### Q: What happened to the WebCrawler class?

**A**: The [`WebCrawler`](file://d:\Work\Myhoster\260306-zdkvartira\crawl-pages\src\lib\web-crawler.ts) class still exists in the codebase but is no longer used. It can be safely deleted in a future cleanup if desired.

## Related Changes

This change is part of a series of improvements:

- ✅ Redirect tracking (3xx status codes)
- ✅ Immediate save of critical data (broken links, redirects)
- ✅ Graceful shutdown on Ctrl-C
- ✅ HTML URL decoding in saved content
- ✅ **Consolidated single-stage scanning** (this change)

## Rollback Plan

If you need to revert to the two-stage process:

1. Restore `src/scripts/crawl.ts` from git history
2. Revert `package.json` changes
3. Revert `README.md` changes
4. Run `pnpm install` to ensure dependencies are correct

However, the single-stage approach is recommended for its simplicity and efficiency.

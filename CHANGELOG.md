# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.3] - 2026-04-25

### Added

- **Internationalized Domain Name (IDN) Support**: Automatic punycode decoding for internationalized domains (e.g., `xn----7sbemcvc6aaeev1c4g.xn--p1ai` → `районные-будни.рф`)
  - Decoded domain names used in file system paths for better readability
  - All reports display Unicode domain names instead of punycode
  - Applied to both internal and external domain tracking
- **Timezone Configuration**: Configurable timezone for date formatting in reports
  - New `timezone` config field with support from TZ environment variable
  - CLI argument: `--timezone Europe/Moscow`
  - Environment variable: `TZ=Europe/Moscow`
  - Fallback to system default timezone if not specified
  - Consistent date format: `YYYY.MM.DD HH:mm ±HHMM` (e.g., `2026.04.25 00:47 +0300`)
- **Scan Time Persistence**: Scan start time is now saved and can be resumed across restarts
  - `scanStartTime` persisted in crawl-state.yaml
  - Reports show separate "Scan Started" and "Scan Finished" timestamps
  - Enables accurate scan duration tracking even after interruptions
- **Configurable Report Pages Capacity**: Customizable number of top/least linked pages in reports
  - New `topReportPagesCount` config parameter (default: 50)
  - CLI argument: `--top-report-pages-count=100`
  - Environment variable: `TOP_REPORT_PAGES_COUNT=100`
  - Both "Most Linked Pages" and "Least Linked Pages" sections use the same count
- **Broken Link Status Codes**: HTTP status codes captured and displayed for broken links
  - Status codes (404, 500, etc.) shown in reports alongside URLs
  - Helps identify specific error types for debugging
  - Graceful fallback when status code unavailable

### Changed

- **Report Format Improvements**: Enhanced report structure with clearer timing information
  - Separate "Scan Started" and "Scan Finished" lines instead of combined timestamp
  - Dynamic section headers showing actual page count (e.g., "Top 50 Most Linked Pages")
  - Consistent timezone-aware date formatting throughout
- **Domain Display**: All domain references now show decoded Unicode names
  - Site header displays readable domain names
  - External domains list shows Unicode instead of punycode
  - Improved user experience for international sites

## [0.0.2] - 2026-04-22

### Added

- **StateManager integration in SiteScanner**: Full state management integration with centralized StateManager for consistent state handling across scan and crawl operations
- **Batch state updates**: New `updateFromScanner()` method in StateManager for efficient batch updating of all scanner data (pages, broken links, external links, link relations, crawled pages)
- **State persistence on scan completion**: Automatic saving of all state data to YAML files when scanning completes, including crawl-state.yaml, broken-links.yaml, and link relations files
- **Comprehensive state loading**: SiteScanner now loads all historical state data on initialization (crawled pages, broken links, external links, link relations) from StateManager

### Changed

- **StateManager requirement**: Made StateManager a required parameter in SiteScanner constructor (previously optional) for guaranteed state availability
- **Enhanced logging**: Added detailed state loading statistics showing counts of crawled pages, broken links, external links, and link relations
- **Improved state synchronization**: Scanner and crawler now share the same state foundation, enabling seamless resume across both operations

### Fixed

- **State data consistency**: Ensured all scanner-generated data is properly persisted to StateManager and saved to disk
- **Resume reliability**: Fixed issue where scanner state wasn't being saved, preventing proper resume functionality

## [0.0.1] - 2026-04-22

### Added

- **Initial release** of Crawl-Site v0.0.1
- **Two-stage architecture**: Separate scan (URL discovery) and crawl (content download) processes
- **State management system**: Centralized StateManager for tracking queued, completed, failed pages, broken links, external links, link relations, and crawled pages
- **Resume capability**: Full support for resuming interrupted scans and crawls from saved state
- **Intelligent caching**:
  - Skips re-fetching pages already saved to disk during scanning
  - No delays applied to cached pages for instant processing
  - Broken links can be rescanned on subsequent runs
- **Link analysis engine**:
  - Hierarchical link relations tracking (`{targetUrl: [sourceUrls]}` format)
  - Automatic self-reference filtering
  - Separate tracking for internal, external, and broken links
  - Link relation query helpers for finding pages linking to/from specific URLs
- **URL handling improvements**:
  - Cyrillic and unicode URL support with proper decoding
  - Extension preservation (prevents double extensions like `.jpg.html`)
  - Trailing slash preservation to avoid 404 errors
  - Correct relative URL resolution even without trailing slashes
- **Smart retry mechanism**: Failed pages automatically retried up to configured max retries with exponential backoff
- **Periodic progress saving**: Saves state every 10 pages or 5 errors to prevent data loss
- **Real-time progress logging**: Shows currently processing page with counters during operations
- **Browser impersonation**: Realistic browser User-Agent headers by default
- **robots.txt compliance**: Optional robots.txt respect feature
- **Exclude rules**: Pattern-based URL exclusion via `exclude.yaml` configuration
- **Cross-domain filtering**: Automatically filters out sitemaps and URLs from different domains
- **Memory optimization**: Clears response data after saving to free memory
- **Configurable delays**: Exponential backoff with configurable maximum delay cap
- **Development tooling**:
  - Linting with oxlint and tsc
  - Jest testing framework setup with unit tests
  - Code quality commands (check-all, format, etc.)
  - Absolute imports using `@/*` path mapping

### Changed

- **YAML-only data format**: All state and data files use YAML format for better readability (migrated from JSON)
  - `sitemap.yaml`, `crawl-state.yaml`, `broken-links.yaml`
  - `internal-links.yaml`, `external-links.yaml`
  - `internal-link-relations.yaml`, `external-link-relations.yaml`
- **Improved error messages**: Compact, readable error formatting without verbose stack traces
- **URL normalization strategy**: Preserves original URLs for fetching while using normalized (decoded) URLs for deduplication and storage
- **StateManager integration**: Both SiteScanner and WebCrawler now use centralized StateManager for consistent state handling
- **Broken links loading**: StateManager now loads broken links from dedicated `broken-links.yaml` file on initialization
- **Commands**: Use dash-delimited naming (e.g., `scan-build`, `check-all-fix`) instead of colon-delimited
- **TypeScript configuration**: Includes baseUrl and paths for absolute imports
- **Jest configuration**: Supports TypeScript path aliases via moduleNameMapper

### Fixed

- **Trailing slash URL handling**: Fixed 404 errors caused by removing trailing slashes before fetching URLs
- **Relative URL resolution**: Fixed incorrect URL resolution when base URL lacks trailing slash (e.g., `/reviews` correctly resolving `./2025/...` to `/reviews/2025/...`)
- **Cyrillic URL encoding**: URLs with Cyrillic characters now properly decoded and stored in readable form in YAML files
- **Double extension bug**: Files with existing extensions (like `.jpg`, `.pdf`) no longer get `.html` appended
- **State persistence**: Ensures all data is saved periodically to prevent loss on failures
- **Broken link re-processing**: Links already marked as broken are now skipped during link extraction
- **Cached page delays**: Removed unnecessary delays when processing already-saved pages
- **Import path issues**: Resolved by implementing absolute imports
- **Type naming inconsistencies**: Standardized across the codebase (e.g., CrawlConfig vs CrawlerConfig)

### Performance Improvements

- **Instant cached page processing**: Zero delay for pages loaded from disk cache
- **Broken link skip optimization**: Avoids queueing and processing known broken URLs
- **Efficient state loading**: Batch loads all state data (pages, links, relations) on initialization
- **Memory-efficient scanning**: Periodic DOM cleanup and response data clearing

### Technical Details

- **TypeScript implementation**: Full type safety throughout the codebase
- **Modular architecture**: Separated concerns into distinct modules (scanner, crawler, state manager, delay manager, etc.)
- **Comprehensive logging**: Configurable log levels with real-time progress indicators
- **Error resilience**: Graceful error handling with automatic retry and fallback mechanisms

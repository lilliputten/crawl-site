# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [0.0.1] - 2026-04-22

### Added

- Initial project setup with TypeScript
- Two-stage crawling process (scan and crawl)
- XML and HTML sitemap parsing with multi-sitemap support
- robots.txt support and compliance
- State management for resuming interrupted crawls
- Exponential backoff on errors with configurable delays
- Cyrillic URL support (decoded, not percent-encoded)
- Configurable delays between requests
- Environment variable configuration (.env and .env.local)
- Command-line argument overrides
- HTML content saving with original site structure preservation
- Comprehensive logging with configurable levels (debug/info/warn/error)
- Progress tracking and statistics display
- Linting with oxlint and tsc
- Jest testing framework setup with 8 passing unit tests
- Clean command to remove generated files
- README.md documentation with usage examples
- CHANGELOG.md following Keep a Changelog format
- Absolute imports using `@/*` path mapping
- Jest moduleNameMapper configuration for TypeScript path aliases
- Code quality commands (check-all, check-all-fix, format, format-check, etc.)
- pretty-quick integration for cached incremental formatting
- Dash-delimited script naming convention for cross-platform compatibility

### Changed

- Commands use dash-delimited naming (e.g., `scan-build`, `check-all-fix`) instead of colon-delimited
- TypeScript configuration includes baseUrl and paths for absolute imports
- Jest configuration supports TypeScript path aliases via moduleNameMapper
- Simplified lint command to run only oxlint for faster feedback
- Format command uses pretty-quick with cache for improved performance

### Deprecated

### Removed

- Redundant jest.config.json file (consolidated into jest.config.js)

### Fixed

- Cyrillic URL decoding issue where Node.js URL objects automatically re-encode paths
- Unused import warnings in test files
- Type naming inconsistencies across the codebase (CrawlConfig vs CrawlerConfig)
- Import path issues resolved by implementing absolute imports
- Test failures related to URL decoding edge cases

### Security

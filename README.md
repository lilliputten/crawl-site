# Crawl-Site

A TypeScript-based website crawler and scanner with resume capability. It scans site structure, crawls pages, and saves HTML content while maintaining the original site structure.

## Features

- **Two-stage process**: Scan (discover URLs) and Crawl (download content)
- **Sitemap support**: Parse XML and HTML sitemaps
- **Resume capability**: Continue crawling from where you left off
- **Configurable delays**: Exponential backoff on errors
- **Cyrillic URL support**: Properly handles unicode characters in URLs
- **robots.txt respect**: Optional robots.txt compliance
- **State management**: Tracks progress and can resume later
- **Configurable**: Environment variables and command-line arguments

## Installation

```bash
pnpm install
```

## Configuration

### Environment Variables

Copy `.env` to `.env.local` and modify as needed:

```env
# Single sitemap URL
SITE_URL=https://example.com
SITEMAP_URLS=["https://example.com/sitemap.xml"]

# Multiple sitemap URLs (JSON array format)
# SITEMAP_URLS=["https://example.com/sitemap1.xml","https://example.com/sitemap2.xml","https://example.com/blog/sitemap.xml"]

CRAWL_DELAY=1000
MAX_RETRIES=3
RETRY_DELAY_BASE=2000
REQUEST_TIMEOUT=30000
DEST=./crawled-content
STATE_DIR=./crawl-data
USER_AGENT=Mozilla/5.0 (compatible; CrawlSiteBot/0.1)
RESPECT_ROBOTS_TXT=true
MAX_PAGES=0
LOG_LEVEL=info
```

**Example with multiple sitemaps in .env.local:**

```env
SITE_URL=https://example.com
SITEMAP_URLS=["https://example.com/sitemap-main.xml","https://example.com/sitemap-products.xml","https://example.com/sitemap-blog.xml"]
CRAWL_DELAY=1500
DEST=./output
```

### Command-Line Arguments

All environment variables can be overridden via command-line arguments:

```bash
# Single sitemap URL
pnpm scan --site-url=https://example.com --sitemap-urls='["https://example.com/sitemap.xml"]'

# Multiple sitemap URLs (use JSON array string)
pnpm scan --site-url=https://example.com --sitemap-urls='["https://example.com/sitemap1.xml","https://example.com/sitemap2.xml"]'

# Complex multi-sitemap example
pnpm scan \
  --site-url=https://mysite.com \
  --sitemap-urls='["https://mysite.com/sitemap-index.xml","https://mysite.com/products/sitemap.xml","https://mysite.com/blog/sitemap.xml"]' \
  --crawl-delay=2000

# Crawl with custom settings
pnpm crawl --dest=./output --max-pages=100
```

Available arguments:

- `--site-url=` - Target website URL
- `--sitemap-urls=` - JSON array of sitemap URLs
- `--crawl-delay=` - Delay between requests (ms)
- `--max-retries=` - Maximum retry attempts
- `--retry-delay-base=` - Base delay for retries (ms)
- `--request-timeout=` - Request timeout (ms)
- `--dest=` - Output directory
- `--state-dir=` - State storage directory
- `--user-agent=` - Custom user agent string
- `--respect-robots-txt=` - Respect robots.txt (true/false)
- `--max-pages=` - Maximum pages to crawl (0 = unlimited)
- `--log-level=` - Log level (debug/info/warn/error)

## Usage

### Quick Start (No Build Required)

The project uses `tsx` to run TypeScript directly without compilation:

```bash
# Basic usage
pnpm scan    # Scan site structure (runs TypeScript source)
pnpm crawl   # Crawl and download pages (runs TypeScript source)
pnpm start   # Run both scan and crawl sequentially

# With custom arguments
pnpm scan --site-url=https://example.com --crawl-delay=2000
pnpm crawl --dest=./output --max-pages=100
```

### Development Mode

For automatic reloading during development:

```bash
pnpm dev     # Watch mode for scan script
```

### Production Mode (Compiled JavaScript)

After building, you can run the compiled JavaScript:

```bash
pnpm build         # Compile TypeScript to JavaScript
pnpm scan-build    # Run compiled scan.js from dist/
pnpm crawl-build   # Run compiled crawl.js from dist/
pnpm start-build   # Build and run both scripts
```

### Code Quality & Formatting

The project includes comprehensive code quality tools:

```bash
# Type checking with pretty output
pnpm check-types   # tsc --pretty --noEmit

# Linting
pnpm lint          # Run oxlint
pnpm lint-fix      # Auto-fix lint issues

# Code formatting (Prettier)
pnpm format        # Auto-format all source files
pnpm format-check  # Check formatting without changes

# Comprehensive checks (recommended before commits)
pnpm check-all      # Run all checks (types + lint + format + tests)
pnpm check-all-fix  # Run all checks with auto-fixes
```

### Testing

```bash
pnpm test          # Run Jest tests
pnpm test-watch    # Watch mode for tests
```

### Cleanup

```bash
pnpm clean         # Remove dist/, crawl-data/, crawled-content/
```

## Project Structure

```
crawl-site/
├── src/
│   ├── config/          # Configuration management
│   ├── lib/             # Core libraries
│   │   ├── url-utils.ts      # URL utilities
│   │   ├── file-utils.ts     # File operations
│   │   ├── logger.ts         # Logging
│   │   ├── delay-manager.ts  # Delay and backoff
│   │   ├── sitemap-parser.ts # Sitemap parsing
│   │   ├── robots-parser.ts  # robots.txt handling
│   │   ├── state-manager.ts  # State persistence
│   │   ├── site-scanner.ts   # Site scanning
│   │   └── web-crawler.ts    # Web crawling
│   ├── scripts/         # Entry points
│   │   ├── scan.ts           # Scan script
│   │   └── crawl.ts          # Crawl script
│   └── types/           # TypeScript types
├── .env                 # Default configuration
├── .env.local           # Local overrides (gitignored)
├── package.json
├── tsconfig.json
├── README.md
└── CHANGELOG.md
```

## Development

### Running TypeScript Directly (Recommended for Development)

The project uses `tsx` for fast TypeScript execution without compilation:

```bash
pnpm scan          # Run scan.ts directly with tsx
pnpm crawl         # Run crawl.ts directly with tsx
pnpm dev           # Run with file watching (auto-reload)
```

**Benefits of tsx:**

- No build step required - run TypeScript immediately
- Faster development cycle
- Automatic ESM/CJS compatibility
- Better error messages with source maps

### Build Process (Optional)

For production deployment, you can compile to JavaScript:

```bash
pnpm build         # Compile TypeScript → dist/
pnpm clean         # Remove dist/, crawl-data/, crawled-content/
```

### Code Quality & Linting

The project includes comprehensive code quality checks:

```bash
# Type checking
pnpm check-types   # TypeScript type checking with pretty output

# Linting
pnpm lint          # Run oxlint for code style issues
pnpm lint-fix      # Auto-fix linting issues

# Code formatting (Prettier)
pnpm format        # Format code with Prettier
pnpm format-check  # Check formatting without modifying

# Comprehensive checks (recommended before commits)
pnpm check-all      # Run all checks (types + lint + format + tests)
pnpm check-all-fix  # Run all checks and auto-fix issues
```

**Code Quality Tools:**

- **TypeScript** (`tsc --pretty --noEmit`) - Static type checking
- **oxlint** - Fast linter for JavaScript/TypeScript
- **Prettier** - Consistent code formatting
- **Jest** - Unit testing framework

### Testing

```bash
pnpm test          # Run Jest tests
pnpm test-watch    # Watch mode for tests
```

## How It Works

### Scan Phase

1. Loads configuration from environment and CLI
2. Fetches robots.txt (if enabled)
3. Parses provided sitemaps (XML or HTML)
4. If no sitemaps, crawls the site to discover URLs
5. Extracts titles from each page
6. Saves sitemap.json with URL list

### Crawl Phase

1. Loads existing state (if resuming)
2. Reads sitemap.json from scan phase
3. For each URL:
   - Checks robots.txt (if enabled)
   - Downloads HTML content
   - Saves to destination folder
   - Maintains original directory structure
   - Handles Cyrillic URLs properly
4. Saves state after every 10 pages
5. Retries failed pages with exponential backoff

## Key Features

### Cyrillic URL Support

URLs with Cyrillic characters are decoded and saved with proper Unicode characters instead of percent-encoded format:

- `/услуги/` instead of `/%D1%83%D1%81%D0%BB%D1%83%D0%B3%D0%B8/`

### Exponential Backoff

When errors occur, delays increase exponentially:

- First attempt: base delay
- Second attempt: base delay × 2
- Third attempt: base delay × 4
- Maximum: 60 seconds

### State Management

The crawler maintains state in `crawl-state.json` and can resume from where it left off if interrupted. This is useful for large sites.

## License

MIT

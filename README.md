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
SITE_URL=https://example.com
SITEMAP_URLS=["https://example.com/sitemap.xml"]
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

### Command-Line Arguments

All environment variables can be overridden via command-line arguments:

```bash
pnpm scan --site-url=https://example.com --crawl-delay=2000
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

### 1. Scan a Site

Discover all URLs on a website:

```bash
pnpm scan
```

This will:
- Read sitemaps if provided
- Crawl the site to discover URLs
- Save a sitemap.json file with all found URLs and titles

### 2. Crawl a Site

Download all pages from the scanned site:

```bash
pnpm crawl
```

This will:
- Load the sitemap from the scan phase
- Download each page's HTML content
- Save files mirroring the original site structure
- Maintain state for resuming if interrupted

### 3. Clean

Remove all generated data:

```bash
pnpm clean
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

### Build

```bash
pnpm build
```

### Linting

```bash
pnpm lint       # Check for issues
pnpm lint:fix   # Auto-fix issues
```

### Testing

```bash
pnpm test
pnpm test:watch
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

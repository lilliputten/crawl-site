# Crawl-Site

A TypeScript-based website crawler and scanner with resume capability. It scans site structure, crawls pages, and saves HTML content while maintaining the original site structure.

## Features

- **Two-stage process**: Scan (discover URLs) and Crawl (download content)
- **Sitemap support**: Parse XML and HTML sitemaps
- **Resume capability**: Continue crawling from where you left off
- **Smart retry**: Failed pages are automatically retried up to configured max retries
- **Configurable delays**: Exponential backoff on errors
- **Cyrillic URL support**: Properly handles unicode characters in URLs
- **Browser impersonation**: Optional realistic browser headers to avoid detection
- **robots.txt respect**: Optional robots.txt compliance
- **State management**: Tracks progress and can resume later
- **Content preservation**: Saves crawled pages as HTML with original directory structure
- **Link analysis**: Tracks internal, external, and broken links with relationship mapping
- **YAML output**: All state and data files use YAML format for better readability
- **Configurable**: Environment variables and command-line arguments

## Installation

```bash
pnpm install
```

## Configuration

### Environment Variables

Copy `.env` to `.env.local` and modify as needed:

```
# Site Configuration
SITE_URL=https://example.com
SITEMAP_URLS=[]

# Crawl Settings
CRAWL_DELAY=1000
MAX_RETRIES=3
RETRY_DELAY_BASE=2000
REQUEST_TIMEOUT=30000

# Output
DEST=./crawled-content

# State Management
STATE_DIR=./crawl-data

# User Agent (Realistic browser User-Agent by default)
USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36

# Use full browser headers (Accept, Accept-Language, etc.) to impersonate a real browser
USE_BROWSER_HEADERS=false

# URL Exclusion Rules (JSON array format)
# Example: EXCLUDE_RULES=[{"mode":"prefix","string":"/admin/"},{"mode":"suffix","string":".pdf"}]
EXCLUDE_RULES=[]

# Respect robots.txt
RESPECT_ROBOTS_TXT=true

# Max pages to crawl (0 = unlimited)
MAX_PAGES=0

# Log level: debug, info, warn, error
LOG_LEVEL=info
```

**Example with multiple sitemaps in .env.local:**

```
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
- `--max-retries=` - Maximum retry attempts for failed pages
- `--retry-delay-base=` - Base delay for retries (ms)
- `--request-timeout=` - Request timeout (ms)
- `--dest=` - Output directory for crawled content
- `--state-dir=` - State storage directory
- `--user-agent=` - Custom user agent string
- `--use-browser-headers=` - Use realistic browser headers (true/false)
- `--exclude=` - JSON array of URL exclusion rules
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
6. Tracks link relationships between pages
7. Saves progress periodically (every 10 pages)
8. Generates multiple output files (see Output Files section)

### Crawl Phase

1. Loads existing state (if resuming)
2. Reads sitemap.json from scan phase
3. For each URL:
   - Checks robots.txt (if enabled)
   - Downloads HTML content
   - Extracts and tracks links
   - Saves to destination folder
   - Maintains original directory structure
   - Handles Cyrillic URLs properly
4. Saves state and link relations after every 10 pages
5. Retries failed pages with exponential backoff
6. Generates comprehensive link analysis files

## Output Files

After running `pnpm scan` or `pnpm crawl`, you'll find these files in the `crawl-data/` directory:

### Scan Output

- **sitemap.json** - Discovered pages with URLs and titles
- **internal-links.json** - All internal links found (sorted array)
- **broken-links.json** - Internal links that returned errors (404, 500, etc.)
- **external-links.json** - All external links found (sorted array)
- **link-relations.json** - ⭐ Hierarchical link relationship map showing which pages link to which

### Link Relations Format

The `link-relations.json` uses a hierarchical format for easy analysis:

```json
{
  "http://example.com/target-page": [
    "http://example.com/source-page-1",
    "http://example.com/source-page-2"
  ],
  "http://example.com/another-target": [
    "http://example.com/source-page-1",
    "http://example.com/source-page-3"
  ]
}
```

**Key features:**

- ✅ **Excludes self-references** - Pages don't list themselves as sources
- ✅ **Deduplicated** - Each source URL appears only once per target
- ✅ **Sorted** - Both keys and arrays are alphabetically sorted
- ✅ **Easy to query** - Instantly find all pages linking to any URL

### Use Cases

**Find broken link sources:**

```javascript
const linkRelations = require('./crawl-data/link-relations.json');
const brokenLinks = require('./crawl-data/broken-links.json');

brokenLinks.forEach((brokenUrl) => {
  const sources = linkRelations[brokenUrl] || [];
  console.log(`Broken link ${brokenUrl} is referenced by:`, sources);
});
```

**Analyze page popularity:**

```javascript
const linkRelations = require('./crawl-data/link-relations.json');
const popularity = Object.entries(link - relations)
  .map(([url, sources]) => ({ url, inboundLinks: sources.length }))
  .sort((a, b) => b.inboundLinks - a.inboundLinks);
```

### Crawl Output

In addition to scan files, crawling generates:

- **crawl-state.json** - Complete crawl state (can resume from this)
- **crawled-content/** - Downloaded HTML files preserving site structure

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

The crawler maintains state in `crawl-state.json` (and other YAML files) and can resume from where it left off if interrupted. This is useful for large sites.

## Advanced Features

### Smart Retry Mechanism

The crawler automatically retries failed pages to handle temporary network issues or server errors:

- **Configurable retries**: Set `MAX_RETRIES` (default: 3) to control retry attempts
- **Exponential backoff**: Uses `RETRY_DELAY_BASE` with exponential increase on each retry
- **Automatic re-queueing**: Failed pages are added back to the queue for retry
- **Broken link tracking**: Only marks pages as "broken" after all retries are exhausted
- **Resume support**: On restart, previously broken links will be retried again

Example:

```bash
# Customize retry behavior
pnpm scan --max-retries=5 --retry-delay-base=3000
```

### Browser Impersonation

To avoid detection and blocking by websites, you can enable realistic browser headers:

**Environment variable:**

```env
USE_BROWSER_HEADERS=true
```

**Command-line:**

```bash
pnpm scan --use-browser-headers=true
```

When enabled, the crawler sends headers that mimic a real Chrome browser:

- `Accept`: Full content type negotiation
- `Accept-Language`: Language preferences
- `Accept-Encoding`: Compression support
- `Sec-Fetch-*`: Modern browser security headers
- `Cache-Control`: Cache behavior
- `Connection`: Keep-alive connections

**Note:** The default User-Agent is already set to a realistic Chrome browser string. Enable `USE_BROWSER_HEADERS` for additional header fields.

### URL Exclusion Rules

Exclude specific URLs from crawling using flexible matching rules. This helps avoid crawling unnecessary pages like admin panels, search results, or large media files.

**Configuration Sources (Priority Order):**

1. `exclude.local.yaml` - Local overrides (not committed to git)
2. `exclude.yaml` - Project-level rules (can be committed)
3. `EXCLUDE_RULES` environment variable
4. `--exclude` CLI argument

All sources are merged, so you can combine rules from multiple sources.

**Available Matching Modes:**

- **prefix**: URL starts with the specified string
- **suffix**: URL ends with the specified string
- **contains**: URL contains the specified string
- **exact**: URL exactly matches the specified string
- **regex**: URL matches the regular expression pattern

**Example exclude.yaml:**

```yaml
# Exclude admin and auth pages
- mode: prefix
  string: '/admin/'
- mode: prefix
  string: '/auth/'

# Exclude PDF and image files
- mode: suffix
  string: '.pdf'
- mode: suffix
  string: '.jpg'

# Exclude URLs with session parameters
- mode: contains
  string: 'session='

# Exclude pagination patterns
- mode: regex
  string: "\\?page=\\d+"

# Exclude specific page
- mode: exact
  string: 'https://example.com/specific-page'
```

**Environment Variable Example:**

```env
EXCLUDE_RULES=[{"mode":"prefix","string":"/admin/"},{"mode":"suffix","string":".pdf"}]
```

**CLI Example:**

```bash
pnpm scan --exclude='[{"mode":"prefix","string":"/api/"}]'
```

**Use Cases:**

- Skip admin/backend pages (`/admin/`, `/wp-admin/`)
- Exclude large media files (`.pdf`, `.zip`, `.mp4`)
- Avoid dynamic content (`/search?`, `?sort=`)
- Skip authentication flows (`/login`, `/oauth/`)
- Exclude API endpoints (`/api/`, `/graphql`)
- Filter out tracking parameters (`?utm_`, `?fbclid=`)

**Tip:** Use `exclude.local.yaml` for personal testing rules that shouldn't be shared with the team.

### Content Organization

Crawled pages are saved in the `crawled-content` directory maintaining the original site structure:

```
crawled-content/
├── index.html              # Homepage
├── about/
│   └── index.html          # /about/
├── articles/
│   ├── news.html           # /articles/news
│   └── reviews.html        # /articles/reviews
└── контакты/               # Cyrillic URLs preserved!
    └── index.html
```

### Site Structure Analysis

The scanner generates two types of sitemap files to help you understand your site's structure:

**1. Flat Sitemap (`sitemap.yaml`):**
A simple list of all discovered pages with their titles and metadata.

**2. Hierarchical Sitemap (`sitemap-structure.yaml`):**
A tree-like structure showing how pages are interconnected through links:

```yaml
root:
  url: https://example.com/
  children:
    - url: https://example.com/about/
      children:
        - url: https://example.com/about/team/
          children: []
        - url: https://example.com/about/history/
          children: []
    - url: https://example.com/products/
      children:
        - url: https://example.com/products/category-a/
          children: []
orphans:
  - url: https://example.com/old-page/ # Not reachable from homepage
```

**Key Features:**

- **Circular Link Detection**: Pages involved in circular references are marked with `circular: true`
- **Depth Limiting**: Structures deeper than 10 levels are marked as `truncated: true` to prevent excessive nesting
- **Orphaned Pages**: Lists pages that exist but aren't reachable from the homepage
- **Link-Based Structure**: Built from actual link relationships, not URL path patterns

This helps identify:

- Navigation structure issues
- Orphaned content (pages not linked from anywhere)
- Circular navigation patterns
- Deep page hierarchies

### State Management & Resume

The crawler saves progress periodically (every 10 pages or 5 errors) to support resuming:

- **State files**: Stored in `STATE_DIR` (default: `./crawl-data`) in YAML format
- **Automatic resume**: Restart the scanner/crawler and it continues from where it left off
- **Broken link recovery**: Previously failed pages are retried on resume
- **Progress tracking**: View `crawl-state.yaml` to see current progress

## License

MIT

#!/usr/bin/env ts-node

/**
 * Help command - displays available CLI commands and options
 */

const helpText = `
Crawl-Site Help Guide

AVAILABLE COMMANDS:
  pnpm scan          Scan a website to discover URLs and build sitemap
  pnpm crawl         Crawl discovered URLs and save HTML content
  pnpm report        Regenerate report from existing scan data
  pnpm dev           Run scan in watch mode (auto-restart on changes)
  pnpm help          Show this help message

SCAN COMMAND OPTIONS:
  --site-url <url>              Target website URL (required)
                                Example: https://example.com/

  --sitemap-urls <urls>         Sitemap URLs to parse (JSON array or comma-separated)
                                Example: '["https://example.com/sitemap.xml"]'

  --dest <path>                 Destination directory for crawled content
                                Default: ./crawl-default

  --state-dir <path>            Directory for state files (YAML)
                                Default: same as --dest

  --max-pages <number>          Maximum number of pages to scan (0 = unlimited)
                                Default: 0

  --crawl-delay <ms>            Delay between requests in milliseconds
                                Default: 1000

  --max-retries <number>        Maximum retry attempts for failed requests
                                Default: 3

  --retry-delay-base <ms>       Base delay for exponential backoff
                                Default: 2000

  --max-delay <ms>              Maximum delay cap for exponential backoff
                                Default: 10000

  --request-timeout <ms>        Request timeout in milliseconds
                                Default: 30000

  --user-agent <string>         Custom User-Agent header
                                Default: Chrome browser UA

  --use-browser-headers         Use full browser-like headers (default: minimal)

  --respect-robots-txt          Respect robots.txt rules (default: false)

  --log-level <level>           Logging level: debug|info|warn|error
                                Default: info

  --no-color                    Disable colored console output

  --show-exclusion-messages     Show messages when URLs are excluded

  --max-tree-depth <number>     Max depth for hierarchical sitemap tree
                                Default: 5

  --top-report-pages-count      Number of top/least linked pages in report
                                Default: 50

  --exclude <rules>             URL exclusion rules (JSON array)
                                Better to use exclude.yaml file

CONFIGURATION FILES:
  .env                          Environment variables configuration
  .env.local                    Local environment overrides (not committed)
  exclude.yaml                  URL exclusion rules (committed)
  exclude.local.yaml            Local exclusion rules (not committed)

ENVIRONMENT VARIABLES:
  SITE_URL                      Target website URL
  SITEMAP_URLS                  JSON array of sitemap URLs
  DEST                          Destination directory
  STATE_DIR                     State directory
  CRAWL_DELAY                   Delay between requests (ms)
  MAX_RETRIES                   Maximum retry attempts
  MAX_PAGES                     Maximum pages to scan
  LOG_LEVEL                     Logging level
  USER_AGENT                    Custom User-Agent
  USE_BROWSER_HEADERS           Use browser-like headers (true/false)
  RESPECT_ROBOTS_TXT            Respect robots.txt (true/false)
  NO_COLOR                      Disable colors (true/false)
  EXCLUDE_RULES                 JSON array of exclusion rules
  TIMEZONE                      Timezone for date formatting (e.g., Europe/Moscow, America/New_York)

EXCLUSION RULES FORMAT (exclude.yaml):
  - mode: prefix
    string: "/admin/"
  - mode: suffix
    string: ".pdf"
  - mode: contains
    string: "?session="
  - mode: regex
    string: "\\?page=\\d+"
  - mode: exact
    string: "/login"

OUTPUT FILES (in dest directory):
  sitemap.yaml                  List of all discovered URLs
  sitemap-structure.yaml        Hierarchical sitemap structure
  completed.yaml                Successfully crawled pages data
  broken-links.yaml             Broken links with status codes
  external-links.yaml           External links found
  internal-links.yaml           Internal links found
  internal-link-relations.yaml  Internal link relationships
  external-link-relations.yaml  External link relationships
  redirected-pages.yaml         Pages that redirect
  queued.yaml                   URLs waiting to be processed
  failed.yaml                   Failed URLs with errors
  crawl-state.yaml              Scan metadata and statistics
  report.md                     Human-readable scan report
  crawled-content/              Directory with saved HTML files

EXAMPLES:
  # Basic scan
  pnpm scan --site-url=https://example.com/

  # Scan with custom settings
  pnpm scan --site-url=https://example.com/ --max-pages=100 --dest=./my-crawl

  # Scan with exclusion
  pnpm scan --site-url=https://example.com/ --max-pages=50 --log-level=debug

  # Regenerate report from existing data
  pnpm report --site-url=https://example.com/ --dest=./my-crawl

WORKFLOW:
  1. Configure target site in .env or use CLI args
  2. Run 'pnpm scan' to discover URLs
  3. Review generated files in dest directory
  4. Optionally run 'pnpm crawl' to download HTML content
  5. Check report.md for analysis results

For more information, see README.md and PROJECT_STATUS.md
`;

console.log(helpText);

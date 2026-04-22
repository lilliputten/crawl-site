# Command Reference

## Quick Start (No Build Required) ✨ Recommended

Run TypeScript source code directly using `tsx`:

```bash
pnpm scan          # Scan site structure
pnpm crawl         # Crawl and download pages
pnpm start         # Run scan + crawl sequentially
pnpm dev           # Watch mode with auto-reload
```

## Production Mode (Compiled JavaScript)

After building to dist/:

```bash
pnpm build         # Compile TypeScript → dist/
pnpm scan:build    # Run compiled dist/scripts/scan.js
pnpm crawl:build   # Run compiled dist/scripts/crawl.js
pnpm start:build   # Build + run both scripts
```

## Development Tools

```bash
pnpm clean         # Remove dist/, crawl-*/
pnpm check-types   # TypeScript type checking (pretty output, no emit)
pnpm lint          # Run oxlint for code style issues
pnpm lint:fix      # Auto-fix linting issues
pnpm format        # Format code with Prettier
pnpm format:check  # Check formatting without modifying files
pnpm check-all     # Run all checks (types + lint + format + tests)
pnpm check-all:fix # Run all checks and auto-fix issues
pnpm test          # Run Jest tests
pnpm test-watch    # Jest watch mode
```

### Code Quality Commands Explained

**TypeScript Type Checking:**

```bash
pnpm check-types   # tsc --pretty --noEmit
```

- Checks TypeScript types without generating output
- Pretty formatted error messages
- Catches type errors before runtime

**Code Formatting (Prettier):**

```bash
pnpm format        # Auto-format all source files
pnpm format:check  # Verify formatting without changes
```

- Ensures consistent code style
- Formats `.ts`, `.js`, and `.json` files
- Ignores build artifacts and dependencies

**Linting (oxlint):**

```bash
pnpm lint          # Check for code issues
pnpm lint:fix      # Auto-fix fixable issues
```

- Fast JavaScript/TypeScript linter
- Catches common bugs and anti-patterns

**Comprehensive Checks:**

```bash
pnpm check-all     # Full validation (read-only)
pnpm check-all:fix # Full validation with auto-fixes
```

Runs in order:

1. TypeScript type checking
2. Linting
3. Format verification
4. Unit tests

Perfect for CI/CD pipelines!

## Command Line Arguments

All commands accept these arguments:

```bash
pnpm scan --site-url=https://example.com --crawl-delay=2000
pnpm crawl --dest=./output --max-pages=100
```

Available options:

- `--site-url=` - Target website URL (required if not in .env)
- `--sitemap-urls=` - JSON array of sitemap URLs
- `--crawl-delay=` - Delay between requests in milliseconds
- `--max-retries=` - Maximum retry attempts
- `--retry-delay-base=` - Base delay for exponential backoff
- `--request-timeout=` - Request timeout in milliseconds
- `--dest=` - Output directory for crawled content
- `--state-dir=` - Directory for crawl state persistence
- `--user-agent=` - Custom user agent string
- `--respect-robots-txt=` - Respect robots.txt (true/false)
- `--max-pages=` - Maximum pages to crawl (0 = unlimited)
- `--log-level=` - Logging level (debug/info/warn/error)

## Configuration Priority

1. `.env` file (default values)
2. `.env.local` file (local overrides, gitignored)
3. Command-line arguments (highest priority, overrides all)

## Examples

### Basic Usage

```bash
# Configure in .env.local first
echo "SITE_URL=https://example.com" > .env.local
echo 'SITEMAP_URLS=["https://example.com/sitemap.xml"]' >> .env.local

# Scan the site
pnpm scan

# Crawl downloaded pages
pnpm crawl
```

### Custom Configuration

```bash
pnpm scan --site-url=https://mysite.com --crawl-delay=2000 --dest=./my-output
```

### Resume Interrupted Crawl

```bash
# Just run crawl again - it will resume from state
pnpm crawl
```

### Development with Auto-reload

```bash
pnpm dev  # Watches for file changes
```

## Notes

- **tsx** runs TypeScript directly without compilation (faster development)
- State is automatically saved every 10 pages during crawling
- Use `pnpm clean` to start fresh
- Cyrillic URLs are automatically decoded in output filenames

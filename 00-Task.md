Create a nodejs project ('crawl-site') with a set of typescript scripts to scan/crawl a whole site.

Keep progress in TODO.md during the task progress.

It should start with a site url and optional sitemap urls (could be xml or html). (Read them from config and from command line; see below).

First it should create a full site map (with urls and titles).

It should use delays between requests. Should use increasing delays on error. Delays should be configurable.

Use essential parameters from the `.env` (and optional `.env.local` to override basic parameters, add to `.gitignore`).

Should read commandline parameters and override environment configuration.

Should read and save html only (we need only content).

Should mirror original site structure.

Beware of cyclic references.

Cyrillic folder/page names should be stored unquoted (`/услуги/` вместо `/%D1%83%D1%81%D0%BB%D1%83%D0%B3%D0%B8/`).

Use typescript.

Should process by stages:

- scan: retrieve/update the site structure
- crawl: start/continue the crawling process (should keep the state to be ablke to continue later)

Create `package.json` with scripts section ("scan", run", "clean" etc).

Create README.md and CHANGELOG.md. Create other required files.

Add linters (tsc, oxlint) and other dev tools (jest, etc).

Install required dependencies with pnpm.

Use `src` folder` Use `src/lib` for auxilary code.

Possible configurable parameters (use the same variable names for environment, command line parameters and for the code):

siteUrl: string
sitemapUrls: list
crawlDelay: number, ms
dest: string, folder name

(Add other required ones.)

---

Use `dest` for output.

Put `scripts` command to the end of the `package.json`.

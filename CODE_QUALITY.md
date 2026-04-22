# Code Quality Tools & Commands

## New Commands Added ✨

### TypeScript Type Checking

```bash
pnpm check-types   # tsc --pretty --noEmit
```

**Purpose:** Check TypeScript types with formatted error output
**Config:** No file emission, just type validation
**Use when:** Before committing code, in CI/CD pipelines

### Code Formatting (Prettier)

```bash
pnpm format        # Auto-format all source files
pnpm format:check  # Verify formatting without changes
```

**Purpose:** Ensure consistent code style across the project
**Files:** `.ts`, `.js`, `.json` in `src/`
**Config:** See `.prettierrc.json` and `.prettierignore`
**Use when:** Before commits, in pre-commit hooks

### Comprehensive Checks

```bash
pnpm check-all     # Run all checks (types + lint + format + tests)
pnpm check-all:fix # Run all checks with auto-fixes
```

**Purpose:** Complete code quality validation
**Runs in order:**

1. `check-types` - TypeScript compilation
2. `lint` - oxlint code style
3. `format:check` - Prettier formatting
4. `test` - Jest unit tests

**Use when:**

- `check-all`: Before pushing to remote, CI/CD
- `check-all:fix`: Local development with auto-fixes

## Updated Commands

### Linting (Updated)

```bash
pnpm lint          # oxlint only (faster)
pnpm lint:fix      # Auto-fix oxlint issues
```

**Changed from:** Previously included tsc check
**Now:** Just runs oxlint for faster feedback
**Use:** During active development

## Configuration Files

### .prettierrc.json

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### .prettierignore

```
node_modules/
dist/
crawl-*/
coverage/
*.log
.env.local
```

## Workflow Examples

### Quick Development Loop

```bash
# Make changes...
pnpm format          # Auto-format
pnpm check-all:fix   # Fix and validate everything
# Commit when green ✓
```

### Pre-Commit Check

```bash
pnpm check-all       # Full validation (read-only)
# If passes, ready to commit!
```

### CI/CD Pipeline

```bash
pnpm install
pnpm check-types     # Type safety
pnpm lint            # Code style
pnpm format:check    # Formatting
pnpm test            # Unit tests
# Or simply:
pnpm check-all       # All of the above
```

### Fix Formatting Issues

```bash
# If format:check fails:
pnpm format          # Auto-fix formatting
git add .            # Stage changes
pnpm check-all       # Verify everything passes
```

## Command Comparison

| Command         | Types | Lint | Format | Tests | Auto-fix |
| --------------- | ----- | ---- | ------ | ----- | -------- |
| `check-types`   | ✓     |      |        |       |          |
| `lint`          |       | ✓    |        |       |          |
| `lint:fix`      |       | ✓    |        |       | ✓        |
| `format`        |       |      | ✓      |       | ✓        |
| `format:check`  |       |      | ✓      |       |          |
| `test`          |       |      |        | ✓     |          |
| `check-all`     | ✓     | ✓    | ✓      | ✓     |          |
| `check-all:fix` | ✓     | ✓    | ✓      | ✓     | ✓        |

## Integration Tips

### Pre-commit Hook (Husky)

```bash
#!/bin/bash
# .husky/pre-commit
pnpm check-all
```

### VS Code Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### GitHub Actions

```yaml
name: Code Quality
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: pnpm check-all
```

## Benefits

✅ **Type Safety** - Catch errors before runtime
✅ **Consistent Style** - All code follows same patterns
✅ **Automated** - No manual code review for style
✅ **Fast Feedback** - Know issues immediately
✅ **CI/CD Ready** - Perfect for automated pipelines
✅ **Developer Experience** - Focus on logic, not formatting

## Troubleshooting

### Format check fails in CI?

```bash
# Locally:
pnpm format        # Fix formatting
git add .          # Commit changes
pnpm check-all     # Verify
```

### Type errors after formatting?

Formatting doesn't change logic. Check your types are correct.

### Want to skip auto-fix?

Use read-only versions: `check-types`, `lint`, `format:check`

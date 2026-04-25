# Content Transformation Feature

## Overview

The content transformation feature allows you to automatically modify crawled HTML content before it's saved to disk. This is useful for fixing typos, normalizing text, or making other content corrections.

## How It Works

1. **Rules are loaded** from YAML configuration files when the crawler starts
2. **After content is downloaded**, transformations are applied in order
3. **Transformed content is saved** to disk instead of the original

## Configuration Files

### Priority Order (highest to lowest)
1. `content-transform.local.yaml` - Local overrides (not committed to repo)
2. `content-transform.yaml` - Project-level rules (can be committed)

### File Format

Each rule is an object with the following properties:

```yaml
- find: "text to find"           # String or regex pattern (required)
  replace: "replacement text"    # Replacement string (required)
  isRegex: false                 # Whether find is a regex (optional, default: false)
  flags: "g"                     # Regex flags (optional, only if isRegex=true)
```

## Examples

### Simple String Replacement (Most Common)

```yaml
# Fix common typo in Russian text
- find: "Часто задаваемы вопросы"
  replace: "Часто задаваемые вопросы"
```

This will replace ALL occurrences of the string automatically.

### Regex Replacement

```yaml
# Convert HTTP to HTTPS (case-insensitive)
- find: "\\bhttp://"
  replace: "https://"
  isRegex: true
  flags: "gi"
```

Note: Use double backslashes (`\\`) in YAML for single backslash in regex.

### Multiple Rules

Rules are applied in order:

```yaml
- find: "old domain"
  replace: "new domain"
  
- find: "typo"
  replace: "correct"
```

## Current Configuration

The `content-transform.local.yaml` file contains one rule:

```yaml
- find: "Часто задаваемы вопросы"
  replace: "Часто задаваемые вопросы"
```

This fixes a grammatical error in Russian FAQ headings.

## Testing

Unit tests are provided in `src/lib/content-transformer.test.ts`. Run them with:

```bash
npm test -- content-transformer.test.ts
```

## Implementation Details

- **Module**: `src/lib/content-transformer.ts`
- **Integration**: Applied in `src/lib/site-scanner.ts` after download, before save
- **Configuration Loading**: Handled in `src/config/index.ts` via `loadContentTransformRules()`
- **Type Definition**: `ContentTransformRule` interface in `src/types.ts`

## Error Handling

- If a transformation fails (e.g., invalid regex), the original content is preserved
- Errors are logged but don't stop the crawling process
- All transformations are applied even if some fail

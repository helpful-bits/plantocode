# Content Creation Quick Start

**Time to create a page: 7 minutes (down from 50 minutes)**

## TL;DR

```bash
# 1. Generate page
npm run content:create -- --type blog --slug my-article

# 2. Edit content (replace TODO comments)
code src/app/blog/my-article/page.tsx

# 3. Validate
npm run content:validate -- --path src/app/blog/my-article

# 4. Test
npm run dev
# Visit: http://localhost:3000/blog/my-article

# 5. Commit
git add src/app/blog/my-article
git commit -m "Add article: My Article"
```

## Available Content Types

| Type | Path | Use Case |
|------|------|----------|
| `blog` | `/blog/slug` | Articles, comparisons, guides |
| `solution` | `/solutions/slug` | Use-case pages (e.g., "Hard Bugs") |
| `feature` | `/features/slug` | Feature descriptions |
| `comparison` | `/compare/slug` | Tool vs tool comparisons |

## Command Reference

### Create Content
```bash
# Blog post
npm run content:create -- --type blog --slug cursor-best-practices

# Solution page with custom title
npm run content:create -- --type solution --slug refactoring --title "Large Refactoring Projects"

# Feature page
npm run content:create -- --type feature --slug ai-pair-programming

# Comparison page
npm run content:create -- --type comparison --slug cursor-vs-copilot
```

### Validate Content
```bash
# Validate all pages
npm run content:validate

# Validate specific page
npm run content:validate -- --path src/app/blog/my-article

# Strict mode (for CI/CD)
npm run content:validate:strict
```

## What Gets Generated

The generator creates:

1. **File structure**: `src/app/{type}/{slug}/page.tsx`
2. **Complete metadata**: Title, description, OpenGraph, Twitter
3. **Page layout**: Header, main content area, CTA section
4. **TODO markers**: Clear indicators of what needs customization

## Required Edits

Replace these TODO comments:

1. **Description** (150-160 characters)
   ```typescript
   description: 'TODO: Add compelling description (150-160 characters)',
   ```

2. **Keywords** (5-10 keywords)
   ```typescript
   keywords: [
     // TODO: Add 5-10 relevant keywords
     'ai coding',
     'implementation planning',
   ],
   ```

3. **Content sections**
   - Lead paragraph
   - Section headings
   - Body content
   - CTA text

## Using Centralized Metadata (Advanced)

Instead of manual metadata:

```typescript
import { metadataPresets, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';

export const metadata = metadataPresets.blog({
  title: 'My Article Title',
  description: 'Compelling description between 150-160 characters',
  slug: 'my-article',
  keywords: mergeKeywords(
    ['specific keyword'],
    COMMON_KEYWORDS.core
  ),
  publishedTime: new Date().toISOString(),
});
```

## Validation Checks

The validator checks:

- ✓ Required fields (title, description)
- ✓ Title length (<60 chars)
- ✓ Description length (150-160 chars)
- ✓ OpenGraph metadata
- ✓ Twitter card
- ✓ Canonical URLs
- ✓ Keywords presence
- ✓ TODO comments

## Common Issues & Fixes

### "Title too long"
Keep titles under 60 characters. Move extra detail to description.

### "Description too short/long"
Aim for 150-160 characters. This appears in search results.

### "TODO comments remaining"
Search for `TODO:` and replace with actual content.

### "Missing keywords"
Add 5-10 relevant keywords for better SEO.

## CI/CD Integration

Add to `.github/workflows/ci.yml`:

```yaml
- name: Validate Content
  run: npm run content:validate:strict
```

## Examples

### Blog Post
```bash
npm run content:create -- \
  --type blog \
  --slug ai-coding-trends-2025 \
  --title "AI Coding Trends 2025"
```

### Solution Page
```bash
npm run content:create -- \
  --type solution \
  --slug production-debugging \
  --title "Debug Production Issues"
```

### Comparison
```bash
npm run content:create -- \
  --type comparison \
  --slug windsurf-vs-cursor \
  --title "Windsurf vs Cursor Comparison"
```

## Full Documentation

See `README-CONTENT-CREATION.md` for complete documentation.

## Support

- Check existing pages for examples
- Review validation output for guidance
- Test locally before committing

---

**Created**: November 2025
**Tools**: create-content.js, validate-content.js, metadata.ts

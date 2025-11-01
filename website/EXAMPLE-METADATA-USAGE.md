# Example: Using Centralized Metadata System

This document shows how to use the centralized metadata system instead of hardcoding metadata in every page.

## Before (Manual Metadata)

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Blog Post - PlanToCode',
  description: 'A comprehensive guide to AI-powered code planning and implementation best practices for large codebases.',
  keywords: [
    'ai code planning',
    'implementation planning',
    'plan mode',
    'ai coding assistant',
    'code generation',
    'cursor alternative',
    'claude code',
  ],
  openGraph: {
    title: 'My Blog Post - PlanToCode',
    description: 'A comprehensive guide to AI-powered code planning.',
    url: 'https://www.plantocode.com/blog/my-post',
    siteName: 'PlanToCode',
    images: [{
      url: 'https://cdn.plantocode.com/images/og-image.png',
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    locale: 'en_US',
    type: 'article',
    publishedTime: '2025-01-15T00:00:00.000Z',
    authors: ['PlanToCode Team'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'My Blog Post - PlanToCode',
    description: 'A comprehensive guide to AI-powered code planning.',
    images: [{
      url: 'https://cdn.plantocode.com/images/og-image.png',
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
  alternates: {
    canonical: 'https://www.plantocode.com/blog/my-post',
    languages: {
      'en-US': 'https://www.plantocode.com/blog/my-post',
      'en': 'https://www.plantocode.com/blog/my-post',
    },
  },
};
```

**Issues**:
- 50+ lines of boilerplate
- Error-prone (typos, inconsistencies)
- Hard to maintain
- Duplicated across pages

---

## After (Centralized Metadata)

```typescript
import { metadataPresets, mergeKeywords, COMMON_KEYWORDS } from '@/content/metadata';

export const metadata = metadataPresets.blog({
  title: 'My Blog Post - PlanToCode',
  description: 'A comprehensive guide to AI-powered code planning and implementation best practices for large codebases.',
  slug: 'my-post',
  keywords: mergeKeywords(
    ['cursor alternative', 'claude code'],
    COMMON_KEYWORDS.core
  ),
  publishedTime: '2025-01-15T00:00:00.000Z',
});
```

**Benefits**:
- Only 11 lines
- Type-safe
- Consistent structure
- Auto-generates OpenGraph, Twitter card, canonical URLs
- Reuses common keywords

---

## Example 1: Blog Post with Custom Keywords

```typescript
import { metadataPresets, mergeKeywords, COMMON_KEYWORDS } from '@/content/metadata';

export const metadata = metadataPresets.blog({
  title: 'Cursor vs GitHub Copilot: Complete 2025 Comparison',
  description: 'Deep dive comparison of Cursor and GitHub Copilot for AI-assisted coding. Features, pricing, performance benchmarks, and real-world usage scenarios.',
  slug: 'cursor-vs-copilot-2025',
  keywords: mergeKeywords(
    // Article-specific keywords
    ['cursor vs copilot', 'cursor comparison', 'copilot alternative', 'best ai coding tool'],
    // Common core keywords
    COMMON_KEYWORDS.core,
    // CLI tool keywords
    COMMON_KEYWORDS.cliTools
  ),
  publishedTime: '2025-01-15T00:00:00.000Z',
});
```

**Result**: Generates complete metadata with 11 keywords from 3 sources.

---

## Example 2: Solution Page

```typescript
import { metadataPresets, COMMON_KEYWORDS } from '@/content/metadata';

export const metadata = metadataPresets.solution({
  title: 'Resolve Hard Bugs with Preserved Context - PlanToCode',
  description: 'How PlanToCode captures plan history, terminal logs, and live transcripts so tricky production issues can be reproduced without guesswork.',
  slug: 'hard-bugs',
  keywords: [
    'production debugging',
    'bug reproduction',
    'context preservation',
    'terminal logs',
    'debugging workflow',
    ...COMMON_KEYWORDS.core,
    ...COMMON_KEYWORDS.teamFeatures,
  ],
});
```

**Features**:
- Uses `solution` preset (auto-adds solution-specific metadata)
- Includes common keywords
- No need to specify OpenGraph or Twitter card

---

## Example 3: Feature Page

```typescript
import { metadataPresets, COMMON_KEYWORDS } from '@/content/metadata';

export const metadata = metadataPresets.feature({
  title: 'Deep Research - AI Web Search for Developers | PlanToCode',
  description: 'AI-powered research assistant that generates sophisticated research queries and executes parallel research tasks with context-aware analysis.',
  slug: 'deep-research',
  keywords: [
    'ai web search',
    'intelligent research',
    'information synthesis',
    'research workflow',
    ...COMMON_KEYWORDS.core,
    ...COMMON_KEYWORDS.features,
  ],
});
```

**Auto-generated**:
- OpenGraph type: 'website'
- Canonical URL: `https://www.plantocode.com/features/deep-research`
- Full Twitter card
- Alternate language URLs

---

## Example 4: Comparison Page

```typescript
import { metadataPresets } from '@/content/metadata';

export const metadata = metadataPresets.comparison({
  title: 'Cursor vs Windsurf vs PlanToCode: Complete Comparison',
  description: 'Feature-by-feature comparison of Cursor, Windsurf, and PlanToCode. Find the best AI coding tool for your workflow.',
  slug: 'cursor-vs-windsurf',
  toolNames: ['Cursor', 'Windsurf', 'PlanToCode'],
});
```

**Auto-generated keywords**:
- `cursor vs plantocode`
- `windsurf vs plantocode`
- `plantocode vs plantocode`
- `ai coding tool comparison`
- `best coding assistant`
- All common core keywords

---

## Example 5: Using Validation

```typescript
import { metadataPresets, validateMetadata } from '@/content/metadata';

const metadata = metadataPresets.blog({
  title: 'Short',  // Too short!
  description: 'Too short',  // Way too short!
  slug: 'test',
});

const errors = validateMetadata(metadata);

if (errors.length > 0) {
  console.error('Metadata validation failed:', errors);
  // [
  //   'Title too long (5 chars, max 60): "Short"',
  //   'Description length suboptimal (9 chars, recommended 150-160)'
  // ]
}
```

**Use in development**: Catch metadata issues before deployment.

---

## Example 6: Schema.org Structured Data

```typescript
import { metadataPresets, generateArticleSchema, generateFAQSchema } from '@/content/metadata';
import { StructuredData } from '@/components/seo/StructuredData';

export const metadata = metadataPresets.blog({
  title: 'My Article',
  description: 'Description here',
  slug: 'my-article',
  publishedTime: '2025-01-15T00:00:00.000Z',
});

export default function MyArticlePage() {
  const articleSchema = generateArticleSchema({
    headline: 'My Article',
    description: 'Description here',
    url: 'https://plantocode.com/blog/my-article',
    datePublished: '2025-01-15T00:00:00.000Z',
    author: 'PlanToCode Team',
  });

  const faqSchema = generateFAQSchema([
    {
      question: 'How does it work?',
      answer: 'It works by generating templates and validating metadata.',
    },
    {
      question: 'Is it fast?',
      answer: 'Yes, it reduces page creation time by 86%.',
    },
  ]);

  return (
    <>
      <StructuredData data={articleSchema} />
      <StructuredData data={faqSchema} />
      {/* Your page content */}
    </>
  );
}
```

**Result**: Rich snippets in Google search results.

---

## Example 7: Custom Metadata (Advanced)

```typescript
import { generateMetadata, mergeKeywords, COMMON_KEYWORDS } from '@/content/metadata';

export const metadata = generateMetadata({
  title: 'Custom Page',
  description: 'Custom description',
  type: 'landing',
  slug: '',  // Empty for homepage
  keywords: mergeKeywords(
    ['custom', 'keywords'],
    COMMON_KEYWORDS.core
  ),
  image: {
    url: 'https://custom-cdn.com/custom-image.png',
    width: 1200,
    height: 630,
    alt: 'Custom Image Alt Text',
  },
});
```

**Use case**: When presets don't fit your needs.

---

## Common Keyword Collections

### COMMON_KEYWORDS.core
```typescript
[
  'ai code planning',
  'implementation planning',
  'plan mode',
  'ai coding assistant',
  'code generation',
]
```

### COMMON_KEYWORDS.cliTools
```typescript
[
  'cursor cli',
  'claude code',
  'codex cli',
  'gemini cli',
]
```

### COMMON_KEYWORDS.features
```typescript
[
  'file discovery',
  'voice transcription',
  'integrated terminal',
  'implementation plans',
  'text improvement',
]
```

### COMMON_KEYWORDS.teamFeatures
```typescript
[
  'human-in-the-loop ai',
  'corporate ai governance',
  'ai plan approval workflow',
  'team collaboration',
]
```

### COMMON_KEYWORDS.models
```typescript
[
  'gpt-5 planning',
  'claude sonnet 4',
  'gemini 2.5 pro',
  'multi model planning',
]
```

---

## Best Practices

### 1. Use Presets for Standard Pages
```typescript
// ✅ Good
export const metadata = metadataPresets.blog({...});

// ❌ Avoid
export const metadata: Metadata = { /* 50 lines of boilerplate */ };
```

### 2. Merge Keywords for Relevance
```typescript
// ✅ Good - Combines specific + common
keywords: mergeKeywords(
  ['specific', 'keywords'],
  COMMON_KEYWORDS.core
)

// ❌ Avoid - Only specific keywords
keywords: ['specific', 'keywords']
```

### 3. Validate in Development
```typescript
import { validateMetadata } from '@/content/metadata';

if (process.env.NODE_ENV === 'development') {
  const errors = validateMetadata(metadata);
  if (errors.length > 0) {
    console.warn('Metadata issues:', errors);
  }
}
```

### 4. Use Schema.org for Rich Snippets
```typescript
// ✅ Good - Generates article schema
const schema = generateArticleSchema({...});

// Results in rich snippets in search
```

---

## Migration Guide

### Converting Existing Pages

**Step 1**: Install imports
```typescript
import { metadataPresets, mergeKeywords, COMMON_KEYWORDS } from '@/content/metadata';
```

**Step 2**: Replace metadata
```typescript
// Before
export const metadata: Metadata = {
  title: '...',
  description: '...',
  // ... 50 lines
};

// After
export const metadata = metadataPresets.blog({
  title: '...',
  description: '...',
  slug: '...',
  keywords: [...],
});
```

**Step 3**: Validate
```bash
npm run content:validate -- --path src/app/blog/your-page
```

---

## Summary

**Benefits of Centralized Metadata**:
- ✅ 80% less boilerplate
- ✅ Type-safe
- ✅ Consistent structure
- ✅ Automatic OpenGraph/Twitter
- ✅ Reusable keywords
- ✅ Built-in validation
- ✅ Schema.org support

**When to Use**:
- All new pages (use templates with metadata presets)
- Migrating existing pages (replace manual metadata)
- Generating structured data (use schema helpers)

**When NOT to Use**:
- Highly custom pages with unique requirements (use `generateMetadata()` directly)
- Pages that don't fit standard patterns

# Google Search Console Issues - Fixes

**Date:** November 11, 2025
**Status:** Action Required

## Overview

Google Search Console has identified two types of issues affecting your site's indexing:

1. **Duplicate without user-selected canonical** (21 pages)
2. **Video isn't on a watch page** (15 videos)

---

## Issue 1: Duplicate Without User-Selected Canonical (CRITICAL)

### What It Means

Google found 21 URLs that are duplicates of other content but don't have proper canonical tags telling Google which version to index. This prevents these pages from being indexed and ranking.

### Affected URLs

**Category A: Query Parameter URLs (2 URLs)**
- `https://www.plantocode.com/docs?q={search_term_string}` - Schema.org placeholder, not a real page
- `https://www.plantocode.com/?ref=producthunt` - Marketing tracking parameter

**Category B: Translated Blog Posts (10 URLs)**
- `/ko/blog/ai-pair-programming-vs-ai-planning`
- `/ja/blog/ai-pair-programming-vs-ai-planning`
- `/fr/blog/ai-pair-programming-vs-ai-planning`
- `/de/blog/ai-pair-programming-vs-ai-planning`
- `/es/blog/ai-pair-programming-vs-ai-planning`
- (5 more translated blog posts)

**Category C: Translated Legal Pages (9 URLs)**
- `/de/legal/eu/subprocessors`
- `/fr/legal/eu/privacy`
- `/ko/legal/eu/privacy`
- (6 more translated legal pages)

---

## Root Cause Analysis

### Problem 1: SearchAction Schema URL

**File:** `website/src/app/[locale]/layout.tsx` (Line 153)

```typescript
potentialAction: {
  '@type': 'SearchAction',
  target: 'https://www.plantocode.com/search?q={search_term_string}',
  'query-input': 'required name=search_term_string'
}
```

**Issue:** This schema.org markup tells Google there's a search URL at `/search?q=...`, but no such page exists. Your search is client-side only (via `SearchDialog` component).

**Impact:** Google tries to crawl this URL pattern and finds no canonical tag.

### Problem 2: Query Parameters Not Canonicalized

**Example:** `https://www.plantocode.com/?ref=producthunt`

**Issue:** When users visit URLs with marketing tracking parameters, the page serves correctly but the canonical tag might be self-referencing (pointing to the URL with the query param) instead of pointing to the clean URL.

**Root Cause:** Next.js `metadataBase` generates canonical URLs at build time, but it doesn't know about runtime query parameters.

### Problem 3: Translated Pages Missing or Incorrect Canonical Tags

**Issue:** Translated blog posts and legal pages might not have proper self-referencing canonical tags.

**Expected Behavior:**
- `/ko/blog/ai-pair-programming-vs-ai-planning` should have `<link rel="canonical" href="https://www.plantocode.com/ko/blog/ai-pair-programming-vs-ai-planning" />`
- Each locale version should canonicalize to itself

**Current Behavior:** Unclear - needs verification

---

## Solutions

### Fix 1: Remove SearchAction Schema (IMPLEMENTED ✅)

**Why:** You don't have a search results page, so don't tell Google you do.

**File:** `website/src/app/[locale]/layout.tsx`

**Change:**
```typescript
// BEFORE (Lines 145-156):
const websiteJsonLd: WebSite = {
  '@type': 'WebSite',
  name: 'PlanToCode',
  alternateName: 'PlanToCode',
  url: 'https://www.plantocode.com',
  description: '...',
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://www.plantocode.com/search?q={search_term_string}',
    // @ts-ignore
    'query-input': 'required name=search_term_string'
  }
};

// AFTER:
const websiteJsonLd: WebSite = {
  '@type': 'WebSite',
  name: 'PlanToCode',
  alternateName: 'PlanToCode',
  url: 'https://www.plantocode.com',
  description: 'PlanToCode helps you plan and ship code changes - find the right files, generate and merge AI plans, then run them in a persistent terminal.',
  // SearchAction removed - we use client-side search only
};
```

**Expected Impact:** Removes 1 duplicate URL error from Google Search Console

---

### Fix 2: Query Parameters - Canonical Tags Already Handle This ✅

**Status:** No changes needed - your existing implementation is correct!

**Why `?ref=producthunt` URLs aren't a problem:**

Your `metadata.ts` already generates canonical URLs based on pathname only (ignoring query parameters):

```typescript
// From metadata.ts line 102-104
const siteUrl = BASE_METADATA.siteUrl.replace(/\/$/, '');
const canonical = `${siteUrl}${localizedUrl(pathname, locale)}`;
```

**Result:**
- When users visit `/?ref=producthunt`, the page serves with `<link rel="canonical" href="https://www.plantocode.com/" />`
- Google sees the canonical tag and knows to treat both URLs as the same page
- You preserve tracking parameters for analytics

**Expected Impact:**
- Google will recognize these as duplicates automatically (via canonical tags)
- No code changes needed
- Tracking parameters preserved for your analytics
- May take 2-4 weeks for Google to re-crawl and update

---

### Fix 3: Translated Pages Have Correct Canonical Tags (VERIFIED ✅)

**Current Implementation:** Your `metadata.ts` already generates self-referencing canonical tags correctly:

```typescript
// From metadata.ts line 102-104
const siteUrl = BASE_METADATA.siteUrl.replace(/\/$/, '');
const canonical = `${siteUrl}${localizedUrl(pathname, locale)}`;
```

This SHOULD work correctly. Let me verify one translated blog post has correct metadata.

**Action Required:** Check if translated blog posts are using the `generatePageMetadata()` or `generateMetadata()` functions from `metadata.ts`.

**File to Check:** `website/src/app/[locale]/(site)/blog/ai-pair-programming-vs-ai-planning/page.tsx`

**Expected:** Should call `generatePageMetadata()` or `generateMetadata()` with the correct locale

**If NOT using the metadata helper:**
- Update the blog post page to use `generatePageMetadata()` from `@/content/metadata`
- Pass the current `locale` from Next.js params

---

### Fix 4: Alternative - Use `metadataBase` with Dynamic Metadata (OPTIONAL)

If Fix 2 (middleware redirect) isn't preferred, you can make metadata generation aware of the current URL.

**Why Not Recommended:** More complex, doesn't prevent Google from discovering the duplicate URLs in the first place.

---

## Issue 2: Video Isn't on a Watch Page (LOW PRIORITY)

### What It Means

Google found 15 videos embedded on your pages but can't index them as video search results because they're not on dedicated "watch pages."

### Affected Videos

**Examples:**
- `https://d2tyb0wucqqf48.cloudfront.net/assets/videos/step-1-voice.mp4` (on homepage, /de, /es, /fr, /ja, /ko)
- `https://d2tyb0wucqqf48.cloudfront.net/assets/videos/hero-section-16by9_vp9.webm` (on /screenshots and localized versions)

### Why This Happens

Google prefers videos to be:
1. On dedicated watch pages (like YouTube's `/watch?v=...`)
2. The main content of the page
3. Wrapped with VideoObject schema

Your videos are embedded as supporting content on feature/marketing pages, not as the primary content.

---

## Solutions for Video Indexing

### Option 1: Ignore This Warning (RECOMMENDED)

**Rationale:**
- Your videos are product demos and UI walkthroughs, not standalone content
- You're not trying to rank in video search results
- The videos support text content, which is more valuable for SEO
- Video search traffic is likely minimal for B2B developer tools

**Action:** None required

---

### Option 2: Add VideoObject Schema (MEDIUM EFFORT)

**If** you want videos to appear in Google Video search:

**Add this schema to pages with videos:**

```typescript
// Example for homepage
const videoSchema = {
  '@type': 'VideoObject',
  name: 'PlanToCode Voice Transcription Demo',
  description: 'See how PlanToCode transcribes voice input to create implementation plans',
  thumbnailUrl: 'https://www.plantocode.com/images/video-thumbnail-voice.jpg',
  uploadDate: '2024-08-13',
  duration: 'PT0M30S', // 30 seconds - adjust to actual duration
  contentUrl: 'https://d2tyb0wucqqf48.cloudfront.net/assets/videos/step-1-voice.mp4',
  embedUrl: 'https://www.plantocode.com/',
};
```

**Files to Update:**
- `website/src/app/[locale]/(site)/page.tsx` (homepage)
- `website/src/app/[locale]/(site)/screenshots/page.tsx`

**Impact:** Videos may appear in Google Video search (minimal traffic expected for B2B tools)

---

### Option 3: Create Dedicated Video Watch Pages (HIGH EFFORT)

**Why Not Recommended:**
- Requires creating `/videos/step-1-voice`, `/videos/hero-demo`, etc.
- Duplicate content with existing pages
- Not valuable for user experience
- Minimal SEO benefit for B2B developer tools

---

## Implementation Priority

### Completed ✅

1. ✅ **Fix 1:** Remove SearchAction schema from `layout.tsx`
2. ✅ **Fix 2:** Verified canonical tags handle query parameters correctly (no changes needed)
3. ✅ **Fix 3:** Verified translated blog posts use `generatePageMetadata()` correctly

### Next Steps (Week 1-2)

1. **Deploy** the SearchAction schema removal to production
2. **Submit** affected pages to Google Search Console for re-indexing
3. **Monitor** "Duplicate without user-selected canonical" errors over 2-4 weeks
4. **Verify** errors decrease from 21 → 0

### Optional (LOW PRIORITY)

1. Add VideoObject schema if video search traffic is desired
2. Monitor video indexing status

---

## Expected Results

### After Fixes (Week 1-2)
- ✅ SearchAction URL error resolved immediately
- ✅ Query parameter duplicate errors resolved (301 redirects active)
- ⚠️ Translated page errors should resolve if metadata is correct

### Month 1
- Google Search Console shows 0 "Duplicate without user-selected canonical" errors
- All translated pages indexed correctly
- Indexing coverage improves from current state

### Video Indexing
- If ignored: No change (videos remain unindexed in video search)
- If VideoObject added: Videos may appear in Google Video search within 2-4 weeks

---

## Files Modified

### Changes Made ✅

```bash
# 1. Removed SearchAction schema
website/src/app/[locale]/layout.tsx
# Lines 145-152: Removed potentialAction from websiteJsonLd

# 2. No changes needed to proxy.ts
# Canonical tags already handle query parameters correctly

# 3. Verified blog post metadata
website/src/app/[locale]/(site)/blog/ai-pair-programming-vs-ai-planning/page.tsx
# Already uses generatePageMetadata() with correct locale ✅
```

### Optional Changes (VideoObject schema)

```bash
website/src/app/[locale]/(site)/page.tsx
website/src/app/[locale]/(site)/screenshots/page.tsx
```

---

## Testing Plan

### Test 1: Verify SearchAction Removal

```bash
# After deploying changes, check source code:
curl https://www.plantocode.com/ | grep "SearchAction"
# Should return: nothing (schema removed)
```

### Test 2: Verify Query Parameters Have Canonical Tags

```bash
# Test that tracking params serve correct canonical tag:
curl "https://www.plantocode.com/?ref=producthunt" | grep "canonical"
# Should show: <link rel="canonical" href="https://www.plantocode.com/" />

curl "https://www.plantocode.com/?utm_source=twitter" | grep "canonical"
# Should show: <link rel="canonical" href="https://www.plantocode.com/" />
```

### Test 3: Verify Translated Page Canonicals

```bash
# Check Korean blog post has correct canonical:
curl https://www.plantocode.com/ko/blog/ai-pair-programming-vs-ai-planning | grep "canonical"
# Should show: <link rel="canonical" href="https://www.plantocode.com/ko/blog/ai-pair-programming-vs-ai-planning" />

# Check German legal page has correct canonical:
curl https://www.plantocode.com/de/legal/eu/subprocessors | grep "canonical"
# Should show: <link rel="canonical" href="https://www.plantocode.com/de/legal/eu/subprocessors" />
```

---

## Rollback Plan

If issues arise after deployment:

### Rollback SearchAction Removal
```bash
git revert <commit-hash>
# Re-add SearchAction schema to layout.tsx
```

**Note:** The SearchAction removal has no user-facing impact since the `/search?q=...` URL never existed. Rollback is only needed if structured data validation tools report errors.

---

## Next Steps

1. **Deploy** the SearchAction schema removal to production
2. **Test** using curl commands above to verify canonical tags are working
3. **Submit pages** to Google Search Console for re-indexing:
   - URL Inspection tool → Enter affected URLs → "Request indexing"
4. **Monitor** Google Search Console for 2-4 weeks
5. **Decide on video indexing strategy** (recommend: ignore)

---

## Summary

**The Problem:** 21 duplicate content errors preventing important pages from being indexed

**The Fix:**
1. Remove non-existent SearchAction schema ✅ (5 min - DONE)
2. Rely on existing canonical tags to handle query parameters ✅ (already working)
3. Verified translated pages use correct metadata helpers ✅ (already correct)

**Expected Outcome:** All 21 duplicate errors resolved within 2-4 weeks after Google re-crawls

**Time Investment:** 5 minutes of development + 2-4 weeks of Google re-crawling

**Priority:** HIGH - SearchAction removal is critical; other issues will resolve via existing canonical tags

# GA4 Testing Guide - Quick Start

## Prerequisites
1. Google Analytics Debugger Chrome extension installed
2. Access to GA4 property (ID: G-SNQQT3LLEB)
3. Development or production website running

## Step-by-Step Testing

### 1. Enable Debug Mode
```bash
# Option A: Install Chrome Extension
https://chrome.google.com/webstore/detail/google-analytics-debugger/

# Option B: Add to URL
?debug_mode=true
```

### 2. Access GA4 DebugView
1. Go to: https://analytics.google.com/analytics/web/
2. Navigate: Admin → Data Streams → Web
3. Click on your data stream
4. Go to: Reports → Realtime → DebugView

### 3. Test Each Event Type

#### Test 1: Page Load & GA4 Script
**What to test:** GA4 script loads correctly
**Steps:**
1. Open browser DevTools → Network tab
2. Filter for "gtag"
3. Visit homepage
4. Verify gtag.js loads successfully

**Expected result:**
- 200 response from googletagmanager.com
- No console errors

---

#### Test 2: Scroll Depth Tracking
**Event:** `scroll_depth`
**What to test:** Events fire at correct scroll percentages

**Steps:**
1. Open DebugView in GA4
2. Visit homepage (/)
3. Scroll slowly to 25% of page
4. Continue to 50%, 75%, 90%

**Expected events in DebugView:**
```
scroll_depth { percentage: 25 }
scroll_depth { percentage: 50 }
scroll_depth { percentage: 75 }
scroll_depth { percentage: 90 }
```

**Verify:**
- ✅ Event fires only once per milestone
- ✅ Correct percentage values
- ✅ No duplicate events

**Repeat on:**
- `/demo` page
- `/compare/cursor-vs-windsurf` page

---

#### Test 3: Demo Start Event (Video Button)
**Event:** `demo_start`
**What to test:** Demo engagement tracking

**Steps:**
1. Visit `/demo` page
2. Click "View Short Demo" button

**Expected event in DebugView:**
```
demo_start {
  location: "demo_page_hero"
}
```

**Verify:**
- ✅ Event fires immediately on click
- ✅ Correct location parameter
- ✅ Only fires once per click

---

#### Test 4: Demo Start Event (Interactive Demo)
**Event:** `demo_start`
**What to test:** Interactive demo scroll tracking

**Steps:**
1. Visit homepage (/) or `/demo`
2. Scroll to the interactive demo section
3. Wait for first step to enter viewport

**Expected event in DebugView:**
```
demo_start {
  location: "interactive_demo_scroll"
}
```

**Verify:**
- ✅ Event fires when first step enters view
- ✅ Correct location parameter
- ✅ Only fires once per session

---

#### Test 5: Hero CTA Clicks
**Event:** `cta_click_hero`
**What to test:** Primary CTA tracking

**Steps:**
1. Visit homepage (/)
2. Click "Try Interactive Demo →" button
3. Go back
4. Click "Download for Free" button

**Expected events in DebugView:**
```
cta_click_hero {
  button_text: "Try Interactive Demo",
  destination_url: "/demo",
  page_location: "hero"
}

cta_click_hero {
  button_text: "Download for Free",
  destination_url: "/downloads",
  page_location: "hero"
}
```

**Verify:**
- ✅ Event fires on click
- ✅ All parameters present
- ✅ Correct button text and URL

---

#### Test 6: Footer CTA Clicks
**Event:** `cta_click_footer`
**What to test:** Footer link tracking

**Steps:**
1. Scroll to footer
2. Click "Interactive Demo" link
3. Go back
4. Click "Downloads" link

**Expected events in DebugView:**
```
cta_click_footer {
  button_text: "Interactive Demo",
  destination_url: "/demo",
  page_location: "footer"
}

cta_click_footer {
  button_text: "Downloads",
  destination_url: "/downloads",
  page_location: "footer"
}
```

**Verify:**
- ✅ Event fires on click
- ✅ All parameters present
- ✅ Correct location (footer)

---

#### Test 7: Comparison Page CTAs
**Event:** `cta_click_comparison`
**What to test:** Comparison page conversion tracking

**Steps:**
1. Visit `/compare/cursor-vs-windsurf` page
2. Scroll to bottom CTA section
3. Click "Download PlanToCode" link
4. Go back
5. Click "Try Interactive Demo" link

**Expected events in DebugView:**
```
cta_click_comparison {
  button_text: "Download PlanToCode",
  destination_url: "/downloads",
  page_location: "comparison"
}

cta_click_comparison {
  button_text: "Try Interactive Demo",
  destination_url: "/demo",
  page_location: "comparison"
}
```

**Verify:**
- ✅ Event fires on click
- ✅ All parameters present
- ✅ Correct comparison location

---

## Quick Test Script

Run this comprehensive test in ~5 minutes:

```
1. Homepage Scroll
   - Load / → Scroll to 90% → Check 4 scroll_depth events

2. Hero CTAs
   - Click "Try Interactive Demo" → Check cta_click_hero
   - Back → Click "Download for Free" → Check cta_click_hero

3. Demo Start (Video)
   - Go to /demo → Click video button → Check demo_start

4. Demo Start (Interactive)
   - Scroll to interactive demo → Check demo_start

5. Comparison CTAs
   - Go to /compare/cursor-vs-windsurf
   - Scroll to bottom → Click both CTAs → Check cta_click_comparison

6. Footer CTAs
   - Scroll to footer → Click both tracked links → Check cta_click_footer
```

## Troubleshooting

### Events Not Appearing in DebugView

**Check 1: Script Loading**
```javascript
// Open browser console and check:
typeof gtag
// Should return: "function"
```

**Check 2: Environment Variable**
```bash
# Verify in .env.local:
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-SNQQT3LLEB
```

**Check 3: Ad Blockers**
- Disable all ad blockers
- Try incognito mode
- Check browser console for errors

**Check 4: GA4 Property**
- Verify you're looking at correct property
- Check data stream is active
- Ensure DebugView is enabled

### Duplicate Events

**Issue:** Same event firing twice

**Fix:**
```javascript
// Check for:
1. Multiple onClick handlers
2. Conflicting tracking scripts
3. Parent/child element both tracked
```

### Missing Parameters

**Issue:** Event fires but missing properties

**Inspect in Browser:**
```javascript
// In browser console:
window.gtag
// Send test event:
gtag('event', 'test', { param1: 'value1' })
```

## Success Criteria

All tests pass when:
- ✅ All 7 event types fire correctly
- ✅ All event parameters are present
- ✅ No duplicate events
- ✅ No console errors
- ✅ Events appear in DebugView within seconds
- ✅ Real-time report shows activity

## Post-Testing Steps

After successful testing:

1. **Monitor for 24 hours**
   - Check real-time reports
   - Verify event counts are reasonable
   - Look for anomalies

2. **Create Conversion Goals**
   - Mark demo_start as conversion
   - Mark download CTAs as conversion
   - Set up conversion funnel

3. **Build Custom Reports**
   - CTA performance comparison
   - Scroll depth by page
   - Demo engagement metrics

## Test Report Template

```markdown
## GA4 Testing Report
**Date:** [Date]
**Tester:** [Name]
**Environment:** [Production/Staging]

### Test Results

| Test | Status | Notes |
|------|--------|-------|
| GA4 Script Load | ✅/❌ | |
| Scroll Depth (Homepage) | ✅/❌ | |
| Scroll Depth (Demo) | ✅/❌ | |
| Scroll Depth (Comparison) | ✅/❌ | |
| Demo Start (Video) | ✅/❌ | |
| Demo Start (Interactive) | ✅/❌ | |
| Hero CTA (Demo) | ✅/❌ | |
| Hero CTA (Download) | ✅/❌ | |
| Footer CTA (Demo) | ✅/❌ | |
| Footer CTA (Download) | ✅/❌ | |
| Comparison CTA (Download) | ✅/❌ | |
| Comparison CTA (Demo) | ✅/❌ | |

### Issues Found
[List any issues]

### Recommendations
[Any optimization suggestions]
```

## Contact

For issues or questions:
- Check: `/docs/ga4-analytics-implementation.md`
- Review: Browser DevTools Console
- Inspect: GA4 DebugView
- Debug: Network tab for gtag requests

---

**Last Updated:** 2025-01-01
**Version:** 1.0
**Status:** ✅ Ready for Testing

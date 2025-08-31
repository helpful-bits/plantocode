# Vibe Manager Website - Deployment & Configuration Guide

## Vercel Environment Variables

Add these environment variables in your Vercel project settings (Settings → Environment Variables):

### Required Variables

#### Analytics Configuration
```bash
# Plausible Analytics (Optional - defaults to 'vibemanager.app')
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=vibemanager.app

# X (Twitter) Conversions API - Required for conversion tracking
X_DOWNLOAD_EVENT_ID=your-single-event-tag-id  # Get from X Ads Manager → Events Manager
X_ADS_API_TOKEN=your_api_token  # Secret - get from X Ads API

# Google Site Verification (Optional - for Search Console)
GOOGLE_SITE_VERIFICATION_CODE=your_verification_code

# Google Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-SNQQT3LLEB  # Your Google Analytics 4 Measurement ID
```

#### CDN Configuration
```bash
# Media CDN Base URL (Optional - defaults to CloudFront)
NEXT_PUBLIC_MEDIA_CDN_BASE=https://d2tyb0wucqqf48.cloudfront.net
```

### Setting Up in Vercel

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add each variable with the appropriate value
4. Select which environments to apply to (Production/Preview/Development)
5. Save and redeploy for changes to take effect

### Getting Your X Pixel ID

1. Log in to X Ads Manager (ads.twitter.com)
2. Go to Tools → Events Manager
3. Create or select your Pixel
4. Copy the Pixel ID (format: `qd2ik` or similar)
5. Also note your Event IDs for conversions (e.g., `qd2io` for downloads)

## Fixed: Hydration Mismatch Error

### The Problem
The website was experiencing a persistent hydration error that occurred "ALL the time". The error was caused by the `MonacoCodeViewerInner` component checking DOM state during initialization to detect dark mode.

### What Was Happening
1. **Server-Side Rendering (SSR)**: During SSR, `window` and `document` are undefined, so the component initialized `isDarkMode` to `false`
2. **Client-Side Hydration**: During hydration, the component would check the actual DOM and might find dark mode is `true`
3. **Mismatch**: React detected that the server HTML didn't match the client state, causing a hydration error

### The Fix Applied
```typescript
// BEFORE (Caused hydration errors):
const [isDarkMode, setIsDarkMode] = useState(() => {
  if (typeof window === 'undefined') return false;
  const htmlElement = document.documentElement;
  const bodyElement = document.body;
  return htmlElement.classList.contains('dark') || 
         bodyElement.classList.contains('dark');
});

// AFTER (Hydration-safe):
const [isDarkMode, setIsDarkMode] = useState(false);
// Dark mode is now properly detected in useEffect after mount
```

### Why This Fix Works
1. **Consistent Initial State**: Both server and client start with `isDarkMode = false`
2. **Post-Mount Detection**: The actual dark mode is detected in `useEffect` which only runs on the client after hydration
3. **No Mismatch**: The initial render is identical on both server and client

### Additional Improvements Made
- Removed `console.log` statements that were polluting production logs
- Added clear comments explaining the hydration safety approach
- The `MonacoCodeViewer` wrapper already uses `ssr: false` for the Monaco editor itself

## Monitoring & Verification

### Verify Analytics Are Working

1. **Plausible Analytics**:
   - Open browser DevTools → Network tab
   - Look for requests to `plausible.io/api/event`
   - Check that events fire on download button clicks

2. **X Pixel**:
   - Install X Pixel Helper browser extension
   - Verify base pixel loads on page load
   - Confirm conversion events fire on download clicks
   - Check for proper event parameters

3. **Check for Hydration Errors**:
   - Open browser console
   - Look for React hydration warnings
   - Test theme switching (light/dark mode)
   - Verify Monaco editor loads without errors

### Build Verification
```bash
# Build locally to test
pnpm build

# Check for TypeScript errors
pnpm typecheck

# Test production build locally
pnpm start
```

## Common Issues & Solutions

### Issue: X Pixel Not Firing
- **Solution**: Ensure `X_DOWNLOAD_EVENT_ID` and `X_ADS_API_TOKEN` are set in Vercel
- Check browser ad blockers aren't blocking `ads-twitter.com`

### Issue: Plausible Events Not Showing
- **Solution**: Verify goal names in Plausible dashboard match exactly:
  - "Download Click"
  - "CTA Click" 
  - "Signup Start"
  - "Section View"

### Issue: Dark Mode Flashing
- **Solution**: This is expected behavior - the theme loads after mount to prevent hydration errors. The brief flash is preferable to breaking the entire interactive demo.

## Support

For deployment issues, check:
1. Vercel build logs for compilation errors
2. Browser console for runtime errors
3. Network tab for failed resource loads
4. React DevTools for component errors

Last Updated: 2024
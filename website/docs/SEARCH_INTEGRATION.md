# Search Integration Documentation

This document explains how to set up and configure search functionality for the Vibe Manager website documentation.

## Overview

The documentation search uses a progressive enhancement approach:
1. **Primary**: Pagefind for static site search (requires build-time indexing)
2. **Fallback**: Fuse.js for client-side fuzzy search using a local manifest

## Quick Setup

### For Static Builds (Next.js Export)

1. Build the site for static export:
   ```bash
   npm run build
   npm run export  # if you have static export configured
   ```

2. Generate the search index:
   ```bash
   npm run search:build
   ```

3. The search index will be available at `/pagefind/pagefind.js`

### For Server-Side Rendering

If you're not using static export, you have several options:

#### Option 1: Use Pagefind Node.js API
```bash
npm install pagefind
```

Then create a build script that generates the index after build:
```javascript
// scripts/build-search.js
import { createIndex } from 'pagefind';

const { index } = await createIndex({});
await index.addDirectory('./out');
await index.writeFiles({
  outputPath: './out/pagefind'
});
```

#### Option 2: Use auto-pagefind
```bash
npm install auto-pagefind
```

Add to your build process:
```javascript
// next.config.js
const { withAutoPagefind } = require('auto-pagefind/next');

module.exports = withAutoPagefind({
  // your Next.js config
});
```

## Configuration Details

### Search Scripts in package.json

The following scripts are available:

- `search:build`: Generates Pagefind index for static builds
- `postbuild`: Reminder to run search indexing

### Progressive Enhancement

The search component automatically:

1. **Attempts Pagefind**: Tries to import `/pagefind/pagefind.js`
2. **Falls back to Fuse.js**: Uses local document manifest if Pagefind fails
3. **Graceful degradation**: Works even if both fail

### Pagefind Configuration

Pagefind automatically indexes content but respects these attributes:

- `data-pagefind-ignore="all"`: Excludes entire sections (used on sidebar)
- `data-pagefind-ignore`: Excludes specific elements
- `data-pagefind-meta="title"`: Custom metadata for search results

### Fuse.js Fallback

The fallback search uses a static manifest with these fields:
- `title`: Main document title
- `shortTitle`: Abbreviated title for results
- `description`: Document description
- `tags`: Array of searchable keywords
- `category`: Document category

## Accessibility Features

The search dialog implements proper ARIA patterns:

- `role="searchbox"` on input
- `role="listbox"` on results container
- `role="option"` on individual results
- `aria-activedescendant` for keyboard navigation
- `aria-live="polite"` for result count announcements

## Keyboard Shortcuts

- `Cmd/Ctrl+K`: Open search dialog
- `↑/↓`: Navigate results
- `Enter`: Open selected result
- `Escape`: Close dialog

## Performance Considerations

### Build Time
- Pagefind indexing adds ~2-5 seconds to build time
- Index size scales with content (typically 1-5MB for docs sites)

### Runtime
- Pagefind loads ~100KB on first search
- Fuse.js adds ~20KB to initial bundle
- Search is debounced with 200ms delay

### Caching
- Pagefind index is cached by browsers
- Consider CDN for production deployments

## Deployment Notes

### Vercel/Netlify
Both platforms support running `npm run search:build` in the build process:

```yaml
# .github/workflows/deploy.yml (GitHub Actions)
- name: Build site
  run: npm run build
  
- name: Generate search index
  run: npm run search:build
```

### Custom CI/CD

For custom deployment pipelines:

1. Build the site normally
2. Run `npm run search:build` 
3. Ensure `/pagefind/` directory is included in deployment

### Path Considerations

- Pagefind generates absolute paths based on your build output
- Ensure your base path configuration matches deployment
- For subdirectory deployments, configure `basePath` in Next.js config

## Troubleshooting

### Search Not Working
1. Check browser console for import errors
2. Verify `/pagefind/pagefind.js` exists and is accessible
3. Ensure Fuse.js is installed as dependency

### Missing Results
1. Check `data-pagefind-ignore` attributes
2. Verify content is in build output directory
3. Rebuild search index after content changes

### Performance Issues
1. Consider reducing search result limit
2. Implement result virtualization for large result sets
3. Add loading states and debouncing

## Example Integration

```javascript
// Custom search integration
import { SearchDialog } from '@/components/docs/SearchDialog';

export function MyDocsLayout({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  return (
    <>
      {children}
      <SearchDialog 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
      />
    </>
  );
}
```

## Future Enhancements

Consider implementing:

- Search result highlighting
- Search analytics/telemetry  
- Advanced filters (by category, date, etc.)
- Search suggestions/autocomplete
- Integration with external search services (Algolia, etc.)
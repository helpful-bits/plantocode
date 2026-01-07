'use client';

import { useEffect } from 'react';

export function CSSFix() {
  useEffect(() => {
    // Fix for Next.js 15 + React 19 CSS loading bug with output: 'standalone'
    // This addresses the issue where CSS files are incorrectly loaded as scripts
    const fixCSS = () => {
      // 1. Fix preload links that have incorrect as="script" for CSS files
      document.querySelectorAll('link[rel="preload"][href*="/_next/static/css"][as="script"]').forEach(link => {
        link.setAttribute('as', 'style');
      });

      // 2. Convert CSS script tags to proper stylesheet links
      const cssScripts = document.querySelectorAll('script[src*="/_next/static/css"]');
      cssScripts.forEach(script => {
        const scriptElement = script as HTMLScriptElement;
        const src = scriptElement.src;

        // Check if a proper stylesheet link already exists
        const existingStylesheet = document.querySelector(`link[rel="stylesheet"][href="${src}"]`);

        if (!existingStylesheet) {
          // Create a proper stylesheet link
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = src;
          link.setAttribute('data-precedence', 'next');

          // Insert the stylesheet where the script was
          script.parentNode?.insertBefore(link, script);
        }

        // Remove the incorrect script tag
        script.remove();
      });

      // 3. Also convert any preload links with as="style" to actual stylesheets if they're not loaded
      // This handles cases where preload doesn't convert to stylesheet properly
      document.querySelectorAll('link[rel="preload"][as="style"]').forEach(preloadLink => {
        const href = preloadLink.getAttribute('href');
        if (href && !document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          document.head.appendChild(link);
        }
      });
    };

    // Run immediately
    fixCSS();

    // Run again after DOM is fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fixCSS);
    }

    // Also run after a small delay to catch any dynamically added scripts
    const timeout = setTimeout(fixCSS, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('DOMContentLoaded', fixCSS);
    };
  }, []);

  return null;
}

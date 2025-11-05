'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';

/**
 * Client component that sets the HTML lang attribute based on the current route
 * This runs after hydration to avoid SSR/client mismatch
 */
export function HtmlLangSetter() {
  const locale = useLocale();

  useEffect(() => {
    if (locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return null;
}

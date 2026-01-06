import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing.config';
import type { Locale } from '@/i18n/config';

/**
 * Loads messages in nested format for next-intl
 * Unlike loadMessages from lib/i18n, this keeps the nested structure
 */
async function loadNestedMessages(locale: Locale) {
  const [common, seo, home, features, docs, pages, legal] = await Promise.all([
    import(`@/messages/${locale}/common.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/seo.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/home.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/features.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/docs.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/pages.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/legal.json`).then(m => m.default).catch(() => ({})),
  ]);

  // Merge all message files into one nested object
  return {
    ...common,
    seo,
    home,
    features,
    docs,
    pages,
    legal,
  };
}

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: await loadNestedMessages(locale as Locale)
  };
});

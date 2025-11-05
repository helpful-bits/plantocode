/**
 * Centralized i18n routing configuration
 * Handles locale detection, path manipulation, and URL generation for internationalization
 *
 * NOTE: These are build-time and server-side helpers.
 * For React client components, use the navigation utilities from '@/i18n/navigation' instead,
 * which provide locale-aware versions of Next.js routing hooks (Link, useRouter, usePathname, getPathname, etc.)
 */

import { locales as LOCALES, type Locale, defaultLocale as DEFAULT_LOCALE } from '@/i18n/config';

/**
 * Extracts locale from pathname
 * @param pathname - The URL pathname (e.g., '/en/about', '/de/docs', '/about')
 * @returns The detected locale ('en' or 'de')
 */
export function getLocaleFromPathname(pathname: string): Locale {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return DEFAULT_LOCALE;

  const firstSegment = segments[0];
  if (LOCALES.includes(firstSegment as Locale)) {
    return firstSegment as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Removes locale prefix from pathname
 * @param pathname - The URL pathname (e.g., '/en/about', '/de/docs')
 * @returns Pathname without locale prefix (e.g., '/about', '/docs')
 */
export function removeLocalePrefix(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return '/';
  }

  const firstSegment = segments[0];

  if (LOCALES.includes(firstSegment as Locale)) {
    const remainingPath = segments.slice(1).join('/');
    return remainingPath ? `/${remainingPath}` : '/';
  }

  return pathname;
}

/**
 * Builds a localized path by adding locale prefix
 * @param pathname - The base pathname (e.g., '/about', '/docs')
 * @param locale - The target locale ('en' or 'de')
 * @returns Localized pathname (e.g., '/en/about', '/de/docs')
 */
export function buildLocalizedPath(pathname: string, locale: Locale): string {
  const cleanPath = removeLocalePrefix(pathname);
  if (locale === 'en') {
    return cleanPath;
  }
  const normalizedPath = cleanPath === '/' ? '' : cleanPath;
  return `/${locale}${normalizedPath}`;
}

/**
 * Generates alternate URLs for all supported locales
 * @param pathname - The current pathname
 * @param baseUrl - The base URL of the site (e.g., 'https://example.com')
 * @returns Object with locale codes as keys and full URLs as values
 */
export function getAlternateUrls(
  pathname: string,
  baseUrl: string
): Record<string, string> {
  const cleanPath = removeLocalePrefix(pathname);
  const alternates: Record<string, string> = {};

  // Add alternate URLs for each locale
  for (const locale of LOCALES) {
    const localizedPath = buildLocalizedPath(cleanPath, locale);
    alternates[locale] = `${baseUrl}${localizedPath}`;
  }

  // Add x-default (default to English)
  alternates['x-default'] = `${baseUrl}${buildLocalizedPath(cleanPath, DEFAULT_LOCALE)}`;

  return alternates;
}

/**
 * Checks if a locale is valid
 * @param locale - The locale string to validate
 * @returns True if the locale is supported
 */
export function isValidLocale(locale: string): locale is Locale {
  return LOCALES.includes(locale as Locale);
}

/**
 * Gets available locales for switching (excludes current locale)
 * @param currentLocale - The current locale
 * @returns Array of alternate locales
 */
export function getAlternateLocale(currentLocale: Locale): Locale[] {
  return LOCALES.filter((locale: Locale) => locale !== currentLocale);
}

/**
 * Normalizes pathname to ensure it starts with /
 * @param pathname - The pathname to normalize
 * @returns Normalized pathname
 */
export function normalizePathname(pathname: string): string {
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

/**
 * Gets locale-specific metadata defaults
 * @param locale - The locale
 * @returns Object with locale-specific defaults
 */
export function getLocaleDefaults(locale: Locale) {
  return {
    locale,
    lang: locale,
    dir: 'ltr' as const,
  };
}

/**
 * Builds a locale-aware path for a given pathname
 * Alias for buildLocalizedPath for convenience
 * @param locale - The target locale ('en', 'de', 'fr', 'es')
 * @param pathname - The base pathname (e.g., '/about', '/docs')
 * @returns Localized pathname (e.g., '/en/about', '/de/docs', '/about' for 'en')
 */
export function localePath(locale: Locale, pathname: string): string {
  return buildLocalizedPath(pathname, locale);
}

import { defaultLocale, type Locale } from '@/i18n/config';

export type { Locale } from '@/i18n/config';
export const DEFAULT_LOCALE = defaultLocale;

/**
 * Checks if a value is a plain object (not an array, not null)
 */
export function isPlainObject(value: any): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep merges multiple objects into a single object
 * Later objects override earlier ones at each level
 */
export function deepMerge(...objects: any[]): any {
  const result: any = {};
  for (const obj of objects) {
    if (!isPlainObject(obj)) continue;
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Gets a value from a nested object using a dot-separated path
 * Returns undefined if path doesn't exist
 * Supports both object properties and array indices
 */
export function getByPath(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current == null) {
      return undefined;
    }

    // Handle arrays and objects
    if (Array.isArray(current) || isPlainObject(current)) {
      if (!(key in current)) {
        return undefined;
      }
      current = (current as any)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Normalizes locale input to valid Locale type
 * Returns locale if valid (de, fr, es), otherwise returns 'en'
 */
export function normalizeLocale(input: string | undefined | null): Locale {
  if (input === 'de' || input === 'fr' || input === 'es') return input;
  return 'en';
}

/**
 * Extracts locale from request headers
 * Reads x-next-locale or x-locale header set by middleware based on URL path
 * This is the source of truth for locale in Server Components
 */
export function getLocaleFromHeaders(headers: Headers): Locale {
  const localeHeader = headers.get('x-next-locale') || headers.get('x-locale');
  return normalizeLocale(localeHeader);
}

/**
 * Parses locale from URL pathname
 * Returns locale for /de, /fr, /es or /{locale}/*, otherwise 'en'
 * This is the source of truth for locale
 */
export function getLocaleFromPath(pathname: string): Locale {
  if (pathname === '/de' || pathname.startsWith('/de/')) return 'de';
  if (pathname === '/fr' || pathname.startsWith('/fr/')) return 'fr';
  if (pathname === '/es' || pathname.startsWith('/es/')) return 'es';
  return 'en';
}

/**
 * Generates localized path
 * Prefixes path with /{locale} for non-English locales, returns path as-is for English
 */
export function localePath(locale: Locale, path: string): string {
  if (locale === 'en') return path;
  return `/${locale}${path}`;
}

/**
 * Creates a Proxy that allows dot-notation key access on nested objects
 * Example: proxy['planMode.hero.badge'] resolves to obj.planMode.hero.badge
 */
function createDotNotationProxy(obj: Record<string, any>): Record<string, any> {
  return new Proxy(obj, {
    get(target, prop) {
      if (typeof prop !== 'string') {
        return target[prop as any];
      }

      // If property contains dots, traverse the path
      if (prop.includes('.')) {
        return getByPath(target, prop);
      }

      // Otherwise return directly
      return target[prop];
    }
  });
}

/**
 * Dynamically loads and merges message dictionaries for the given locale
 * Imports message files: common, seo, home, features, docs, pages, legal
 * Returns a Proxy that supports dot-notation key access (e.g., t['planMode.hero.badge'])
 */
export async function loadMessages(locale: Locale): Promise<Record<string, any>> {
  const [common, seo, home, features, docs, pages, legal] = await Promise.all([
    import(`@/messages/${locale}/common.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/seo.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/home.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/features.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/docs.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/pages.json`).then(m => m.default).catch(() => ({})),
    import(`@/messages/${locale}/legal.json`).then(m => m.default).catch(() => ({})),
  ]);

  // Deep merge all namespaces and wrap in a Proxy for dot-notation access
  const merged = deepMerge(common, seo, home, features, docs, pages, legal);
  return createDotNotationProxy(merged);
}

type Namespace =
  | 'common'
  | 'home'
  | 'features'
  | 'docs'
  | 'pages'
  | 'legal'
  | 'seo';

/* Static import map */
const JSON_IMPORTS: Record<string, () => Promise<any>> = {
  // en
  'en/common': () => import('@/messages/en/common.json'),
  'en/home': () => import('@/messages/en/home.json'),
  'en/features': () => import('@/messages/en/features.json'),
  'en/docs': () => import('@/messages/en/docs.json'),
  'en/pages': () => import('@/messages/en/pages.json'),
  'en/legal': () => import('@/messages/en/legal.json'),
  'en/seo': () => import('@/messages/en/seo.json'),
  // de
  'de/common': () => import('@/messages/de/common.json'),
  'de/home': () => import('@/messages/de/home.json'),
  'de/features': () => import('@/messages/de/features.json'),
  'de/docs': () => import('@/messages/de/docs.json'),
  'de/pages': () => import('@/messages/de/pages.json'),
  'de/legal': () => import('@/messages/de/legal.json'),
  'de/seo': () => import('@/messages/de/seo.json'),
  // fr
  'fr/common': () => import('@/messages/fr/common.json'),
  'fr/home': () => import('@/messages/fr/home.json'),
  'fr/features': () => import('@/messages/fr/features.json'),
  'fr/docs': () => import('@/messages/fr/docs.json'),
  'fr/pages': () => import('@/messages/fr/pages.json'),
  'fr/legal': () => import('@/messages/fr/legal.json'),
  'fr/seo': () => import('@/messages/fr/seo.json'),
  // es
  'es/common': () => import('@/messages/es/common.json'),
  'es/home': () => import('@/messages/es/home.json'),
  'es/features': () => import('@/messages/es/features.json'),
  'es/docs': () => import('@/messages/es/docs.json'),
  'es/pages': () => import('@/messages/es/pages.json'),
  'es/legal': () => import('@/messages/es/legal.json'),
  'es/seo': () => import('@/messages/es/seo.json'),
};

/**
 * Loads messages for specific namespaces and returns nested objects directly
 * Used with NextIntlClientProvider for client-side i18n
 */
export async function loadMessagesFor(locale: Locale, namespaces: Namespace[]): Promise<Record<string, any>> {
  const objects: any[] = [];
  for (const ns of namespaces) {
    const key = `${locale}/${ns}`;
    const loader = JSON_IMPORTS[key];
    if (!loader) continue;
    const mod = await loader();
    objects.push(mod?.default ?? mod ?? {});
  }
  const merged = deepMerge(...objects);
  return createDotNotationProxy(merged);
}

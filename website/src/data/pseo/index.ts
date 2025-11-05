// Import all category JSONs
import type { Locale } from '@/i18n/config';
import workflows from './workflows.json';
import integrations from './integrations.json';
import comparisons from './comparisons.json';
import stacks from './stacks.json';
import useCases from './use-cases.json';
import features from './features.json';

// Define the page interface
export interface PseoPage {
  slug: string;
  category?: string;
  headline: string;
  subhead: string;
  meta_title: string;
  meta_description: string;
  primary_cta: string;
  publish: boolean;
  priority: number;
  pain_points?: Array<{
    problem: string;
    solution: string;
  }>;
  workflow_steps?: string[];
  key_features?: string[];
  comparison_table?: {
    features: Array<{
      name: string;
      plantocode: string;
      competitor: string;
    }>;
  };
  // Optional metadata fields
  tool_integration?: string;
  os?: string;
  language?: string;
  framework?: string;
  workflow?: string;
  role?: string;
  feature?: string;
  use_case?: string;
  competitor?: string;
}

// Localization types
export type LocalizedOverrides = Partial<Pick<PseoPage,
  'headline' | 'subhead' | 'meta_title' | 'meta_description' | 'primary_cta' |
  'pain_points' | 'workflow_steps' | 'key_features'
>>;

export type Translations = {
  en?: LocalizedOverrides;
  de?: LocalizedOverrides;
  fr?: LocalizedOverrides;
  es?: LocalizedOverrides;
  ko?: LocalizedOverrides;
  ja?: LocalizedOverrides;
};

export type PseoPageWithTranslations = PseoPage & {
  translations?: Translations;
};

// Combine all pages and add category from parent
const allPages: PseoPage[] = [
  ...workflows.pages.map(page => ({ ...page, category: workflows.category })),
  ...integrations.pages.map(page => ({ ...page, category: integrations.category })),
  ...comparisons.pages.map(page => ({ ...page, category: comparisons.category })),
  ...stacks.pages.map(page => ({ ...page, category: stacks.category })),
  ...useCases.pages.map(page => ({ ...page, category: useCases.category })),
  ...features.pages.map(page => ({ ...page, category: features.category })),
];

// Export the combined data structure (compatible with existing code)
export const pseoData = {
  pages: allPages,
  metadata: {
    version: "2.0.0",
    last_updated: new Date().toISOString().split('T')[0],
    total_pages: allPages.length,
    published_pages: allPages.filter(p => p.publish === true).length,
    categories: ['workflows', 'integrations', 'stacks', 'comparisons', 'use-cases', 'features']
  }
};

// Export category-specific getters for targeted loading
export const getPagesByCategory = (category: string): PseoPage[] => {
  return allPages.filter(page => page.category === category);
};

export const getPublishedPages = (): PseoPage[] => {
  return allPages.filter(page => page.publish === true);
};

export const getPageBySlug = (slug: string): PseoPage | undefined => {
  return allPages.find(page => page.slug === slug);
};

// Export individual categories for direct access
export { workflows, integrations, comparisons, stacks, useCases, features };

// Localization functions

/**
 * Merges base page with inline translations and overlay translations
 */
export function mergeTranslations(
  base: PseoPageWithTranslations,
  locale: Locale,
  overlays: Record<string, LocalizedOverrides>
): PseoPage {
  // Start with base page
  const result: PseoPage = { ...base };

  // For English, return as-is (no translations needed)
  if (locale === 'en') {
    return result;
  }

  // For German, merge inline translations first, then overlays
  const inlineTranslations = base.translations?.[locale];
  const overlayTranslations = overlays[base.slug];

  // Merge inline translations
  if (inlineTranslations) {
    Object.assign(result, inlineTranslations);
  }

  // Merge overlay translations (takes precedence)
  if (overlayTranslations) {
    Object.assign(result, overlayTranslations);
  }

  return result;
}

/**
 * Loads all German overlay files and merges them into a single map
 */
export async function loadDeOverlays(): Promise<Record<string, LocalizedOverrides>> {
  try {
    const [workflows, integrations, stacks, useCases, features, comparisons] = await Promise.all([
      import('./i18n/de/workflows.json').catch(() => ({ default: {} })),
      import('./i18n/de/integrations.json').catch(() => ({ default: {} })),
      import('./i18n/de/stacks.json').catch(() => ({ default: {} })),
      import('./i18n/de/use-cases.json').catch(() => ({ default: {} })),
      import('./i18n/de/features.json').catch(() => ({ default: {} })),
      import('./i18n/de/comparisons.json').catch(() => ({ default: {} })),
    ]);

    // Merge all overlays into a single map by slug
    return {
      ...workflows.default,
      ...integrations.default,
      ...stacks.default,
      ...useCases.default,
      ...features.default,
      ...comparisons.default,
    };
  } catch (error) {
    // Return empty object on any error
    return {};
  }
}

/**
 * Get a page by slug with localization support
 */
export async function getPageBySlugLocalized(
  slug: string,
  locale: Locale
): Promise<PseoPage | undefined> {
  const page = getPageBySlug(slug);

  if (!page) {
    return undefined;
  }

  // For English, return as-is
  if (locale === 'en') {
    return page;
  }

  // Load overlays for the specific locale
  let overlays: Record<string, LocalizedOverrides> = {};
  try {
    if (locale === 'de') {
      overlays = await loadDeOverlays();
    } else if (locale === 'fr') {
      // fr overlays can be added when available
    } else if (locale === 'es') {
      // es overlays can be added when available
    } else if (locale === 'ko') {
      // ko overlays can be added when available
    } else if (locale === 'ja') {
      // ja overlays can be added when available
    }
  } catch {
    // If overlays don't exist, return base page
    return page;
  }

  return mergeTranslations(page as PseoPageWithTranslations, locale, overlays);
}

/**
 * Get all published pages with localization support
 */
export async function getPublishedPagesLocalized(
  locale: Locale
): Promise<PseoPage[]> {
  const pages = getPublishedPages();

  // For English, return as-is
  if (locale === 'en') {
    return pages;
  }

  // Load overlays for the specific locale
  let overlays: Record<string, LocalizedOverrides> = {};
  try {
    if (locale === 'de') {
      overlays = await loadDeOverlays();
    }
    // fr, es, ko, ja overlays can be added when available
  } catch {
    // Return pages without overlays if loading fails
  }

  return pages.map(page =>
    mergeTranslations(page as PseoPageWithTranslations, locale, overlays)
  );
}

// Default export for backward compatibility
export default pseoData;
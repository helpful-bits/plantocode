import type { MetadataRoute } from 'next';
import { getPublishedPages } from '@/data/pseo';
import { locales as SUPPORTED_LOCALES, defaultLocale } from '@/i18n/config';

/**
 * Dynamically loads overlay files for a specific locale and returns a Set of slugs that have translations
 */
async function loadLocaleOverlayMap(locale: string): Promise<Set<string>> {
  try {
    const [workflows, integrations, stacks, useCases, features, comparisons] = await Promise.all([
      import(`@/data/pseo/i18n/${locale}/workflows.json`).catch(() => ({ default: {} })),
      import(`@/data/pseo/i18n/${locale}/integrations.json`).catch(() => ({ default: {} })),
      import(`@/data/pseo/i18n/${locale}/stacks.json`).catch(() => ({ default: {} })),
      import(`@/data/pseo/i18n/${locale}/use-cases.json`).catch(() => ({ default: {} })),
      import(`@/data/pseo/i18n/${locale}/features.json`).catch(() => ({ default: {} })),
      import(`@/data/pseo/i18n/${locale}/comparisons.json`).catch(() => ({ default: {} })),
    ]);

    const allOverlays = {
      ...workflows.default,
      ...integrations.default,
      ...stacks.default,
      ...useCases.default,
      ...features.default,
      ...comparisons.default,
    };

    return new Set(Object.keys(allOverlays));
  } catch (error) {
    // If locale directory doesn't exist, return empty set
    return new Set();
  }
}

/**
 * Helper to create multi-lingual sitemap entries with alternates for all supported locales
 */
function createMultiLingualEntry(
  baseUrl: string,
  path: string,
  lastModified: Date,
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never',
  priority: number
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of SUPPORTED_LOCALES) {
    const url = locale === defaultLocale
      ? `${baseUrl}${path}`
      : `${baseUrl}/${locale}${path}`;

    entries.push({
      url,
      lastModified,
      changeFrequency,
      priority,
      alternates: {
        languages: {
          en: `${baseUrl}${path}`,
          de: `${baseUrl}/de${path}`,
          fr: `${baseUrl}/fr${path}`,
          es: `${baseUrl}/es${path}`,
          ko: `${baseUrl}/ko${path}`,
          ja: `${baseUrl}/ja${path}`,
          'x-default': `${baseUrl}${path}`
        }
      }
    });
  }

  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.plantocode.com';
  const now = new Date();

  // Load overlay maps for all non-default locales to determine which pages have translations
  const [deOverlays, frOverlays, esOverlays, koOverlays, jaOverlays] = await Promise.all([
    loadLocaleOverlayMap('de'),
    loadLocaleOverlayMap('fr'),
    loadLocaleOverlayMap('es'),
    loadLocaleOverlayMap('ko'),
    loadLocaleOverlayMap('ja'),
  ]);

  // Static routes that should have all locale versions
  const staticRoutes = ['/', '/docs', '/features', '/downloads', '/solutions', '/compare', '/blog'];
  const staticPages: MetadataRoute.Sitemap = [];

  for (const route of staticRoutes) {
    const priority = route === '/' ? 1 : 0.9;
    staticPages.push(...createMultiLingualEntry(baseUrl, route, now, 'weekly', priority));
  }

  // Generate pSEO pages entries
  const pseoPages: MetadataRoute.Sitemap = [];
  const publishedPages = getPublishedPages();

  for (const page of publishedPages) {
    const priority = page.priority === 1 ? 0.85 : page.priority === 2 ? 0.75 : 0.7;

    // Generate URLs for all locales
    const localeUrls: Record<string, string> = {
      en: `${baseUrl}/${page.slug}`, // English unprefixed
      de: `${baseUrl}/de/${page.slug}`,
      fr: `${baseUrl}/fr/${page.slug}`,
      es: `${baseUrl}/es/${page.slug}`,
      ko: `${baseUrl}/ko/${page.slug}`,
      ja: `${baseUrl}/ja/${page.slug}`,
    };

    // Always add English version with all alternates
    pseoPages.push({
      url: localeUrls.en!,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority,
      alternates: {
        languages: {
          en: localeUrls.en,
          de: localeUrls.de,
          fr: localeUrls.fr,
          es: localeUrls.es,
          ko: localeUrls.ko,
          ja: localeUrls.ja,
          'x-default': localeUrls.en
        }
      }
    });

    // Add German version if slug has a DE overlay
    if (deOverlays.has(page.slug)) {
      pseoPages.push({
        url: localeUrls.de!,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority,
        alternates: {
          languages: {
            en: localeUrls.en,
            de: localeUrls.de,
            fr: localeUrls.fr,
            es: localeUrls.es,
            ko: localeUrls.ko,
            ja: localeUrls.ja,
            'x-default': localeUrls.en
          }
        }
      });
    }

    // Add French version if slug has a FR overlay
    if (frOverlays.has(page.slug)) {
      pseoPages.push({
        url: localeUrls.fr!,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority,
        alternates: {
          languages: {
            en: localeUrls.en,
            de: localeUrls.de,
            fr: localeUrls.fr,
            es: localeUrls.es,
            ko: localeUrls.ko,
            ja: localeUrls.ja,
            'x-default': localeUrls.en
          }
        }
      });
    }

    // Add Spanish version if slug has an ES overlay
    if (esOverlays.has(page.slug)) {
      pseoPages.push({
        url: localeUrls.es!,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority,
        alternates: {
          languages: {
            en: localeUrls.en,
            de: localeUrls.de,
            fr: localeUrls.fr,
            es: localeUrls.es,
            ko: localeUrls.ko,
            ja: localeUrls.ja,
            'x-default': localeUrls.en
          }
        }
      });
    }

    // Add Korean version if slug has a KO overlay
    if (koOverlays.has(page.slug)) {
      pseoPages.push({
        url: localeUrls.ko!,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority,
        alternates: {
          languages: {
            en: localeUrls.en,
            de: localeUrls.de,
            fr: localeUrls.fr,
            es: localeUrls.es,
            ko: localeUrls.ko,
            ja: localeUrls.ja,
            'x-default': localeUrls.en
          }
        }
      });
    }

    // Add Japanese version if slug has a JA overlay
    if (jaOverlays.has(page.slug)) {
      pseoPages.push({
        url: localeUrls.ja!,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority,
        alternates: {
          languages: {
            en: localeUrls.en,
            de: localeUrls.de,
            fr: localeUrls.fr,
            es: localeUrls.es,
            ko: localeUrls.ko,
            ja: localeUrls.ja,
            'x-default': localeUrls.en
          }
        }
      });
    }
  }

  // Documentation pages
  const docPages: MetadataRoute.Sitemap = [];
  const docRoutes = [
    { path: '/docs/implementation-plans', priority: 0.94 },
    { path: '/docs/file-discovery', priority: 0.93 },
    { path: '/docs/model-configuration', priority: 0.92 },
    { path: '/docs/terminal-sessions', priority: 0.91 },
    { path: '/docs/voice-transcription', priority: 0.91 },
    { path: '/docs/text-improvement', priority: 0.91 },
    { path: '/docs/deep-research', priority: 0.91 },
    { path: '/docs/architecture', priority: 0.94 },
  ];

  for (const route of docRoutes) {
    docPages.push(...createMultiLingualEntry(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Feature pages
  const featurePages: MetadataRoute.Sitemap = [];
  const featureRoutes = [
    { path: '/demo', priority: 0.85 },
    { path: '/features/text-improvement', priority: 0.8 },
    { path: '/features/voice-transcription', priority: 0.8 },
    { path: '/features/integrated-terminal', priority: 0.8 },
    { path: '/features/merge-instructions', priority: 0.8 },
    { path: '/features/plan-mode', priority: 0.8 },
    { path: '/features/file-discovery', priority: 0.8 },
    { path: '/features/deep-research', priority: 0.8 },
    { path: '/features/copy-buttons', priority: 0.8 },
    { path: '/features/video-analysis', priority: 0.8 },
  ];

  for (const route of featureRoutes) {
    featurePages.push(...createMultiLingualEntry(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Plan mode pages
  const planModePages: MetadataRoute.Sitemap = [];
  const planModeRoutes = [
    { path: '/plan-mode', priority: 0.85 },
    { path: '/plan-mode/codex', priority: 0.82 },
    { path: '/plan-mode/claude-code', priority: 0.82 },
    { path: '/plan-mode/cursor', priority: 0.82 },
  ];

  for (const route of planModeRoutes) {
    planModePages.push(...createMultiLingualEntry(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // SEO landing pages
  const seoLandingPages: MetadataRoute.Sitemap = [];
  const seoLandingRoutes = [
    { path: '/cursor-alternative', priority: 0.85 },
  ];

  for (const route of seoLandingRoutes) {
    seoLandingPages.push(...createMultiLingualEntry(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Legal pages - EU
  const legalEUPages: MetadataRoute.Sitemap = [];
  const legalEURoutes = [
    { path: '/legal', priority: 0.6, changeFrequency: 'monthly' as const },
    { path: '/legal/eu/terms', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/legal/eu/privacy', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/legal/eu/imprint', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/legal/eu/subprocessors', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/legal/eu/withdrawal-policy', priority: 0.5, changeFrequency: 'monthly' as const },
    { path: '/legal/eu/dpa', priority: 0.5, changeFrequency: 'monthly' as const },
  ];

  for (const route of legalEURoutes) {
    legalEUPages.push(...createMultiLingualEntry(baseUrl, route.path, now, route.changeFrequency, route.priority));
  }

  // Legal pages - US (EN only, no DE versions for US legal docs)
  const legalUSPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/legal/us/terms`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/us/privacy`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/us/dpa`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
  ];

  // Solutions pages
  const solutionPages: MetadataRoute.Sitemap = [];
  const solutionRoutes = [
    { path: '/solutions/hard-bugs', priority: 0.75 },
    { path: '/solutions/large-features', priority: 0.75 },
    { path: '/solutions/library-upgrades', priority: 0.75 },
    { path: '/solutions/maintenance-enhancements', priority: 0.75 },
    { path: '/solutions/prevent-duplicate-files', priority: 0.8 },
    { path: '/solutions/ai-wrong-paths', priority: 0.8 },
    { path: '/solutions/legacy-code-refactoring', priority: 0.8 },
    { path: '/solutions/safe-refactoring', priority: 0.8 },
  ];

  for (const route of solutionRoutes) {
    solutionPages.push(...createMultiLingualEntry(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Blog posts
  const blogPages: MetadataRoute.Sitemap = [];
  const blogRoutes = [
    { path: '/blog/what-is-ai-code-planning', priority: 0.85 },
    { path: '/blog/ai-code-planning-best-practices', priority: 0.8 },
    { path: '/blog/ai-pair-programming-vs-ai-planning', priority: 0.8 },
  ];

  for (const route of blogRoutes) {
    blogPages.push(...createMultiLingualEntry(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Other pages
  const otherPages: MetadataRoute.Sitemap = [];
  const otherRoutes = [
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/how-it-works', priority: 0.8, changeFrequency: 'weekly' as const },
    { path: '/screenshots', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/schedule', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' as const },
    { path: '/support', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/security/notarization', priority: 0.7, changeFrequency: 'monthly' as const },
  ];

  for (const route of otherRoutes) {
    otherPages.push(...createMultiLingualEntry(baseUrl, route.path, now, route.changeFrequency, route.priority));
  }

  // Comparison pages
  const comparisonPages: MetadataRoute.Sitemap = [];
  const comparisonRoutes = [
    { path: '/compare/cursor-vs-windsurf', priority: 0.85 },
  ];

  for (const route of comparisonRoutes) {
    comparisonPages.push(...createMultiLingualEntry(baseUrl, route.path, now, 'weekly', route.priority));
  }

  return [
    ...staticPages,
    ...pseoPages,
    ...docPages,
    ...featurePages,
    ...planModePages,
    ...seoLandingPages,
    ...legalEUPages,
    ...legalUSPages,
    ...solutionPages,
    ...blogPages,
    ...otherPages,
    ...comparisonPages,
  ];
}

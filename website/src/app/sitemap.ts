import type { MetadataRoute } from 'next';
import { getPublishedPages } from '@/data/pseo';
import { LOCALES } from '@/i18n/config';

/**
 * Helper to create sitemap entries for ALL locales
 * Creates separate entries for each language variant to ensure all pages are indexed
 */
function createLocalizedEntries(
  baseUrl: string,
  path: string,
  lastModified: Date,
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never',
  priority: number
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // Normalization helper: convert '/' to empty string, keep others as-is
  const norm = (p: string) => (p === '/' ? '' : p);

  // Normalize the path parameter
  const normalizedPath = norm(path);

  // Create entry for each locale
  for (const locale of LOCALES) {
    const localePath = locale === 'en' ? normalizedPath : `/${locale}${normalizedPath}`;
    entries.push({
      url: `${baseUrl}${localePath}`,
      lastModified,
      changeFrequency,
      priority,
      alternates: {
        languages: {
          en: `${baseUrl}${norm(path)}`,
          de: `${baseUrl}/de${norm(path)}`,
          fr: `${baseUrl}/fr${norm(path)}`,
          es: `${baseUrl}/es${norm(path)}`,
          ko: `${baseUrl}/ko${norm(path)}`,
          ja: `${baseUrl}/ja${norm(path)}`,
          'x-default': `${baseUrl}${norm(path)}`
        }
      }
    });
  }

  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.plantocode.com';
  const now = new Date();

  // Static routes - all locales
  const staticRoutes = [
    '/',
    '/docs',
    '/features',
    '/downloads',
    '/solutions',
    '/compare',
    '/blog',
    '/integrations',
    '/use-cases',
    '/workflows',
    '/stacks',
    '/comparisons'
  ];
  const staticPages: MetadataRoute.Sitemap = [];

  for (const route of staticRoutes) {
    const priority = route === '/' ? 1 : 0.9;
    staticPages.push(...createLocalizedEntries(baseUrl, route, now, 'weekly', priority));
  }

  // Generate pSEO pages entries - all locales
  const pseoPages: MetadataRoute.Sitemap = [];
  const publishedPages = getPublishedPages();

  for (const page of publishedPages) {
    const priority = page.priority === 1 ? 0.85 : page.priority === 2 ? 0.75 : 0.7;

    // Add all locale versions
    pseoPages.push(...createLocalizedEntries(baseUrl, `/${page.slug}`, now, 'weekly', priority));
  }

  // Documentation pages - all locales
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
    docPages.push(...createLocalizedEntries(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Feature pages - all locales
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
    featurePages.push(...createLocalizedEntries(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Plan mode pages - all locales
  const planModePages: MetadataRoute.Sitemap = [];
  const planModeRoutes = [
    { path: '/plan-mode', priority: 0.85 },
    { path: '/plan-mode/codex', priority: 0.82 },
    { path: '/plan-mode/claude-code', priority: 0.82 },
    { path: '/plan-mode/cursor', priority: 0.82 },
  ];

  for (const route of planModeRoutes) {
    planModePages.push(...createLocalizedEntries(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // SEO landing pages - all locales
  const seoLandingPages: MetadataRoute.Sitemap = [];
  const seoLandingRoutes = [
    { path: '/cursor-alternative', priority: 0.85 },
  ];

  for (const route of seoLandingRoutes) {
    seoLandingPages.push(...createLocalizedEntries(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Legal pages - EU - all locales
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
    legalEUPages.push(...createLocalizedEntries(baseUrl, route.path, now, route.changeFrequency, route.priority));
  }

  // Legal pages - US (EN only, no locale versions for US legal docs)
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
    {
      url: `${baseUrl}/legal/us/subprocessors`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
  ];

  // Solutions pages - all locales
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
    solutionPages.push(...createLocalizedEntries(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Blog posts - all locales
  const blogPages: MetadataRoute.Sitemap = [];
  const blogRoutes = [
    { path: '/blog/what-is-ai-code-planning', priority: 0.85 },
    { path: '/blog/ai-code-planning-best-practices', priority: 0.8 },
    { path: '/blog/ai-pair-programming-vs-ai-planning', priority: 0.8 },
    { path: '/blog/best-ai-coding-assistants-2025', priority: 0.85 },
    { path: '/blog/github-copilot-alternatives-2025', priority: 0.85 },
  ];

  for (const route of blogRoutes) {
    blogPages.push(...createLocalizedEntries(baseUrl, route.path, now, 'weekly', route.priority));
  }

  // Other pages - all locales
  const otherPages: MetadataRoute.Sitemap = [];
  const otherRoutes = [
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/how-it-works', priority: 0.8, changeFrequency: 'weekly' as const },
    { path: '/screenshots', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/schedule', priority: 0.7, changeFrequency: 'weekly' as const },
    { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' as const },
    { path: '/support', priority: 0.8, changeFrequency: 'monthly' as const },
    { path: '/all-pages', priority: 0.6, changeFrequency: 'weekly' as const },
  ];

  for (const route of otherRoutes) {
    otherPages.push(...createLocalizedEntries(baseUrl, route.path, now, route.changeFrequency, route.priority));
  }

  // Comparison pages - all locales
  // NOTE: Most comparison pages are in pSEO data, only add non-pSEO pages here
  const comparisonPages: MetadataRoute.Sitemap = [];
  const comparisonRoutes = [
    { path: '/compare/cursor-vs-windsurf', priority: 0.85 },
    // Other comparison pages are in pSEO data to avoid duplicates
  ];

  for (const route of comparisonRoutes) {
    comparisonPages.push(...createLocalizedEntries(baseUrl, route.path, now, 'weekly', route.priority));
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

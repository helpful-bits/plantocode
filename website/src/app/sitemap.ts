import type { MetadataRoute } from 'next';
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
    '/downloads'
  ];
  const staticPages: MetadataRoute.Sitemap = [];

  for (const route of staticRoutes) {
    const priority = route === '/' ? 1 : 0.9;
    staticPages.push(...createLocalizedEntries(baseUrl, route, now, 'weekly', priority));
  }

  // Documentation pages - all locales
  const docPages: MetadataRoute.Sitemap = [];
  const docRoutes = [
    { path: '/docs/overview', priority: 0.97 },
    { path: '/docs/runtime-walkthrough', priority: 0.96 },
    { path: '/docs/architecture', priority: 0.95 },
    { path: '/docs/desktop-app', priority: 0.94 },
    { path: '/docs/server-api', priority: 0.94 },
    { path: '/docs/mobile-ios', priority: 0.93 },
    { path: '/docs/background-jobs', priority: 0.93 },
    { path: '/docs/data-model', priority: 0.93 },
    { path: '/docs/implementation-plans', priority: 0.94 },
    { path: '/docs/file-discovery', priority: 0.93 },
    { path: '/docs/merge-instructions', priority: 0.93 },
    { path: '/docs/prompt-types', priority: 0.92 },
    { path: '/docs/terminal-sessions', priority: 0.91 },
    { path: '/docs/voice-transcription', priority: 0.91 },
    { path: '/docs/meeting-ingestion', priority: 0.91 },
    { path: '/docs/video-analysis', priority: 0.91 },
    { path: '/docs/text-improvement', priority: 0.91 },
    { path: '/docs/deep-research', priority: 0.91 },
    { path: '/docs/model-configuration', priority: 0.92 },
    { path: '/docs/provider-routing', priority: 0.92 },
    { path: '/docs/decisions-tradeoffs', priority: 0.93 },
    { path: '/docs/build-your-own', priority: 0.93 },
    { path: '/docs/copy-buttons', priority: 0.91 },
    { path: '/docs/server-setup', priority: 0.9 },
    { path: '/docs/tauri-v2', priority: 0.9 },
    { path: '/docs/distribution-macos', priority: 0.9 },
    { path: '/docs/distribution-windows', priority: 0.9 },
  ];

  for (const route of docRoutes) {
    docPages.push(...createLocalizedEntries(baseUrl, route.path, now, 'weekly', route.priority));
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

  // Other pages - all locales
  const otherPages: MetadataRoute.Sitemap = [];
  const otherRoutes = [
    { path: '/architecture', priority: 0.95, changeFrequency: 'weekly' as const },
    { path: '/evolution', priority: 0.9, changeFrequency: 'monthly' as const },
    { path: '/about', priority: 0.7, changeFrequency: 'monthly' as const },
    { path: '/changelog', priority: 0.6, changeFrequency: 'weekly' as const },
    { path: '/support', priority: 0.8, changeFrequency: 'monthly' as const },
  ];

  for (const route of otherRoutes) {
    otherPages.push(...createLocalizedEntries(baseUrl, route.path, now, route.changeFrequency, route.priority));
  }

  return [
    ...staticPages,
    ...docPages,
    ...legalEUPages,
    ...legalUSPages,
    ...otherPages,
  ];
}

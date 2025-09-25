import type { MetadataRoute } from 'next';
import pseoData from '@/data/pseo';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.vibemanager.app';
  const now = new Date();

  // Generate pSEO pages entries
  const pseoPages = pseoData.pages
    .filter(page => page.publish === true)
    .map(page => ({
      url: `${baseUrl}/${page.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: page.priority === 1 ? 0.85 : page.priority === 2 ? 0.75 : 0.7,
    }));

  return [
    // Homepage
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    // Main pages
    {
      url: `${baseUrl}/downloads`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // Documentation pages - all verified to exist
    {
      url: `${baseUrl}/docs`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.95,
    },
    // Documentation pages - verified feature coverage
    {
      url: `${baseUrl}/docs/implementation-plans`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.94,
    },
    {
      url: `${baseUrl}/docs/file-discovery`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.93,
    },
    {
      url: `${baseUrl}/docs/model-configuration`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.92,
    },
    {
      url: `${baseUrl}/docs/terminal-sessions`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.91,
    },
    {
      url: `${baseUrl}/docs/voice-transcription`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.91,
    },
    {
      url: `${baseUrl}/docs/text-improvement`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.91,
    },
    {
      url: `${baseUrl}/docs/deep-research`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.91,
    },
    // Concepts & Architecture
    {
      url: `${baseUrl}/docs/vibe-manager-architecture`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.94,
    },
    // Feature pages
    {
      url: `${baseUrl}/demo`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/features/text-improvement`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features/voice-transcription`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features/integrated-terminal`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features/merge-instructions`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features/plan-mode`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features/file-discovery`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features/deep-research`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/features/copy-buttons`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    // Plan mode page
    {
      url: `${baseUrl}/plan-mode`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
    },
    // Legal pages
    {
      url: `${baseUrl}/legal`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/legal/eu/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/eu/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/eu/imprint`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/eu/subprocessors`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/eu/withdrawal-policy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/eu/dpa`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/us/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/us/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/legal/us/dpa`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // Solutions pages
    {
      url: `${baseUrl}/solutions/hard-bugs`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    {
      url: `${baseUrl}/solutions/large-features`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    {
      url: `${baseUrl}/solutions/library-upgrades`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    {
      url: `${baseUrl}/solutions/maintenance-enhancements`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    // Other pages
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/how-it-works`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/screenshots`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/schedule`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/changelog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/support`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/security/notarization`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // Add all pSEO pages
    ...pseoPages,
  ];
}
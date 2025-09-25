import { NextResponse } from 'next/server';

const CDN_BASE = 'https://d2tyb0wucqqf48.cloudfront.net';
const SITE_URL = 'https://www.vibemanager.app';

interface ImageEntry {
  pageUrl: string;
  images: Array<{
    loc: string;
  }>;
}

const imageEntries: ImageEntry[] = [
  // Homepage images
  {
    pageUrl: SITE_URL,
    images: [
      // Hero section posters
      { loc: `${CDN_BASE}/assets/images/hero-mobile-poster.jpg` },
      { loc: `${CDN_BASE}/assets/images/hero-desktop-poster.jpg` },
      { loc: `${CDN_BASE}/assets/images/hero-thumbnail.jpg` },
      // Tutorial step posters
      { loc: `${CDN_BASE}/assets/images/step-1-text-poster.jpg` },
      { loc: `${CDN_BASE}/assets/images/step-1-voice-poster.jpg` },
      { loc: `${CDN_BASE}/assets/images/step-1-video-poster.jpg` },
      { loc: `${CDN_BASE}/assets/images/step-2-poster.jpg` },
      { loc: `${CDN_BASE}/assets/images/step-3-poster.jpg` },
      { loc: `${CDN_BASE}/assets/images/step-4-poster.jpg` },
      { loc: `${CDN_BASE}/assets/images/step-5-poster.jpg` },
      // OG and social images
      { loc: `${CDN_BASE}/images/og-image.png` },
      { loc: 'https://www.vibemanager.app/images/icon.png' },
    ],
  },
  // Demo page screenshots
  {
    pageUrl: `${SITE_URL}/demo`,
    images: [
      { loc: `${CDN_BASE}/assets/images/demo-file-finder.jpg` },
      { loc: `${CDN_BASE}/assets/images/demo-file-finder-workflow.jpg` },
      { loc: `${CDN_BASE}/assets/images/demo-video-analysis.jpg` },
      { loc: `${CDN_BASE}/assets/images/demo-implementation-plans.jpg` },
      { loc: `${CDN_BASE}/assets/images/demo-background-tasks.jpg` },
      { loc: `${CDN_BASE}/assets/images/demo-settings-prompts.jpg` },
      { loc: `${CDN_BASE}/assets/images/demo-copy-buttons.jpg` },
      { loc: `${CDN_BASE}/assets/images/demo-billing-transactions.jpg` },
    ],
  },
  // Documentation pages
  {
    pageUrl: `${SITE_URL}/docs/implementation-plans`,
    images: [
      { loc: `${CDN_BASE}/assets/images/demo-implementation-plans.jpg` },
    ],
  },
  {
    pageUrl: `${SITE_URL}/docs/file-discovery`,
    images: [
      { loc: `${CDN_BASE}/assets/images/demo-file-finder-workflow.jpg` },
    ],
  },
  {
    pageUrl: `${SITE_URL}/docs/model-configuration`,
    images: [
      { loc: `${CDN_BASE}/assets/images/demo-settings-prompts.jpg` },
    ],
  },
  {
    pageUrl: `${SITE_URL}/docs/terminal-sessions`,
    images: [
      { loc: `${CDN_BASE}/assets/images/demo-background-tasks.jpg` },
    ],
  },
  {
    pageUrl: `${SITE_URL}/docs/voice-transcription`,
    images: [
      { loc: `${CDN_BASE}/assets/images/step-1-voice-poster.jpg` },
    ],
  },
  // Feature pages with hero images
  {
    pageUrl: `${SITE_URL}/features/file-discovery`,
    images: [
      { loc: `${CDN_BASE}/assets/images/demo-file-finder.jpg` },
      { loc: `${CDN_BASE}/assets/images/demo-file-finder-workflow.jpg` },
    ],
  },
  {
    pageUrl: `${SITE_URL}/features/deep-research`,
    images: [
      { loc: `${CDN_BASE}/assets/images/step-3-poster.jpg` },
    ],
  },
  {
    pageUrl: `${SITE_URL}/features/merge-instructions`,
    images: [
      { loc: `${CDN_BASE}/assets/images/demo-implementation-plans.jpg` },
    ],
  },
];

export async function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${imageEntries.map(entry => `  <url>
    <loc>${entry.pageUrl}</loc>${entry.images.map(img => `
    <image:image>
      <image:loc>${img.loc}</image:loc>
    </image:image>`).join('')}
  </url>`).join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
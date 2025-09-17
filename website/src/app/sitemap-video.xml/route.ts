import { NextResponse } from 'next/server';

const CDN_BASE = 'https://d2tyb0wucqqf48.cloudfront.net';
const SITE_URL = 'https://www.vibemanager.app';

interface Video {
  loc: string;
  contentLoc: string;
  title: string;
  description: string;
  thumbnailLoc: string;
  duration?: number; // in seconds
  publicationDate?: string;
}

const videos: Video[] = [
  // Hero Section Videos
  {
    loc: SITE_URL,
    contentLoc: `${CDN_BASE}/assets/videos/hero-section.mp4`,
    title: 'Vibe Manager - AI-Powered Context Curation Demo',
    description: 'Watch how Vibe Manager enhances Claude Code, Cursor, and OpenAI Codex with multi-model planning. Generate implementation plans from GPT-5, Claude Sonnet 4, and Gemini 2.5 Pro.',
    thumbnailLoc: `${CDN_BASE}/assets/images/hero-thumbnail.jpg`,
    duration: 60,
    publicationDate: '2025-08-01T00:00:00Z'
  },
  // Step-by-step Tutorial Videos
  {
    loc: SITE_URL,
    contentLoc: `${CDN_BASE}/assets/videos/step-1-text.mp4`,
    title: 'AI Text Enhancement - Task Description',
    description: 'Learn how to describe tasks with AI assistance that enhances your descriptions with goals, constraints, and affected areas.',
    thumbnailLoc: `${CDN_BASE}/assets/images/step-1-text-poster.jpg`,
    duration: 45,
    publicationDate: '2025-08-01T00:00:00Z'
  },
  {
    loc: SITE_URL,
    contentLoc: `${CDN_BASE}/assets/videos/step-1-voice.mp4`,
    title: 'Voice Dictation - 10x Faster Input',
    description: 'Discover how voice dictation makes task input 10x faster for natural coding workflow with Claude Code and Cursor.',
    thumbnailLoc: `${CDN_BASE}/assets/images/step-1-voice-poster.jpg`,
    duration: 30,
    publicationDate: '2025-08-01T00:00:00Z'
  },
  {
    loc: SITE_URL,
    contentLoc: `${CDN_BASE}/assets/videos/step-1-video.mp4`,
    title: 'Screen Recording - Instant Error Capture',
    description: 'Capture complex workflows and visual context with screen recording. Gemini 2.5 Pro analyzes recordings to extract technical details.',
    thumbnailLoc: `${CDN_BASE}/assets/images/step-1-video-poster.jpg`,
    duration: 40,
    publicationDate: '2025-08-01T00:00:00Z'
  },
  {
    loc: SITE_URL,
    contentLoc: `${CDN_BASE}/assets/videos/step-2-find.mp4`,
    title: 'File Discovery & Search in Your Codebase',
    description: 'Watch how AI intelligently finds relevant files in your codebase using smart search patterns for better context curation.',
    thumbnailLoc: `${CDN_BASE}/assets/images/step-2-poster.jpg`,
    duration: 50,
    publicationDate: '2025-08-01T00:00:00Z'
  },
  {
    loc: SITE_URL,
    contentLoc: `${CDN_BASE}/assets/videos/step-3-generate.mp4`,
    title: 'Deep Research & Context Analysis',
    description: 'See AI perform comprehensive research across your codebase to gather context and understand dependencies for accurate planning.',
    thumbnailLoc: `${CDN_BASE}/assets/images/step-3-poster.jpg`,
    duration: 55,
    publicationDate: '2025-08-01T00:00:00Z'
  },
  {
    loc: SITE_URL,
    contentLoc: `${CDN_BASE}/assets/videos/step-4-merge.mp4`,
    title: 'Plan Creation & Merge from Multiple AI Models',
    description: 'Generate implementation plans from GPT-5, Claude Sonnet 4, Gemini 2.5 Pro and merge the best approaches into a unified solution.',
    thumbnailLoc: `${CDN_BASE}/assets/images/step-4-poster.jpg`,
    duration: 60,
    publicationDate: '2025-08-01T00:00:00Z'
  },
  {
    loc: SITE_URL,
    contentLoc: `${CDN_BASE}/assets/videos/step-5-customize.mp4`,
    title: 'Settings & Prompt Customization',
    description: 'Configure AI models, edit system prompts, and customize settings to match your workflow with Claude Code, Cursor, or OpenAI Codex.',
    thumbnailLoc: `${CDN_BASE}/assets/images/step-5-poster.jpg`,
    duration: 45,
    publicationDate: '2025-08-01T00:00:00Z'
  }
];

export async function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${videos.map(video => `  <url>
    <loc>${video.loc}</loc>
    <video:video>
      <video:content_loc>${video.contentLoc}</video:content_loc>
      <video:title>${escapeXml(video.title)}</video:title>
      <video:description>${escapeXml(video.description)}</video:description>
      <video:thumbnail_loc>${video.thumbnailLoc}</video:thumbnail_loc>
      ${video.duration ? `<video:duration>${video.duration}</video:duration>` : ''}
      ${video.publicationDate ? `<video:publication_date>${video.publicationDate}</video:publication_date>` : ''}
      <video:family_friendly>yes</video:family_friendly>
      <video:live>no</video:live>
    </video:video>
  </url>`).join('\n')}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
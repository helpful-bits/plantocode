import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default rules for all crawlers
      {
        userAgent: '*',
        disallow: [
          '/api/',
          '/admin/',
          '/_next/',
          '/debug/',
          '/private/',
          '/callbacks/',
          '/auth/',
          '/billing/',
          '/all-pages', // Internal review page with noindex
        ],
      },
      // AI Assistants - Explicit Allow rules for AI crawler visibility
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/', '/debug/', '/private/', '/callbacks/', '/auth/', '/billing/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/', '/debug/', '/private/', '/callbacks/', '/auth/', '/billing/'],
      },
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/', '/debug/', '/private/', '/callbacks/', '/auth/', '/billing/'],
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/', '/debug/', '/private/', '/callbacks/', '/auth/', '/billing/'],
      },
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/', '/debug/', '/private/', '/callbacks/', '/auth/', '/billing/'],
      },
      {
        userAgent: 'Anthropic-AI',
        allow: '/',
        disallow: ['/api/', '/admin/', '/_next/', '/debug/', '/private/', '/callbacks/', '/auth/', '/billing/'],
      },
      // Block some noisy crawlers
      {
        userAgent: 'CCBot',
        disallow: '/',
      },
      {
        userAgent: 'Amazonbot',
        disallow: '/',
      },
      {
        userAgent: 'facebookexternalhit',
        disallow: '/',
      },
      {
        userAgent: 'Bytespider',
        disallow: '/',
      },
      // AI training controls - these bots are for AI model training data collection
      // Keeping them separate in case you want to block AI training in the future
      {
        userAgent: 'Google-Extended',
        disallow: '', // Empty disallow = allow all (more compatible than Allow: /)
      },
      {
        userAgent: 'Applebot-Extended',
        disallow: '', // Empty disallow = allow all (more compatible than Allow: /)
      },
    ],
    sitemap: [
      'https://www.plantocode.com/sitemap.xml',
      'https://www.plantocode.com/sitemap-video.xml',
      'https://www.plantocode.com/sitemap-image.xml',
    ],
  };
}
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
        ],
      },
      // Search crawlers
      {
        userAgent: 'Googlebot',
        allow: '/',
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
      },
      {
        userAgent: 'Applebot',
        allow: '/',
      },
      // OpenAI
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      // Anthropic
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      // Perplexity
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
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
      // AI training controls (optional)
      {
        userAgent: 'Google-Extended',
        allow: '/',
      },
      {
        userAgent: 'Applebot-Extended',
        allow: '/',
      },
    ],
    sitemap: 'https://www.vibemanager.app/sitemap.xml',
  };
}
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
      // Major search engines (no need for explicit Allow as they inherit from *)
      // Googlebot, Bingbot, Applebot will follow the default rules above
      // AI Assistants - inherit base rules (no need for Allow: /)
      // GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, PerplexityBot
      // They can access everything except paths in the default disallow list
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
      'https://www.vibemanager.app/sitemap.xml',
      'https://www.vibemanager.app/sitemap-video.xml',
      'https://www.vibemanager.app/sitemap-image.xml',
    ],
  };
}
import type { MetadataRoute } from 'next';

/**
 * Robots.txt Configuration for Vibe Manager (2025)
 * 
 * LEGAL COMPLIANCE NOTES:
 * - GDPR (2025): Allowing AI training crawlers constitutes legitimate interest
 * - EU users have right to object (implemented via privacy policy opt-out)
 * - Some crawlers (Perplexity) may ignore robots.txt directives
 * - For stronger privacy: implement server-level blocking or authentication
 * 
 * STRATEGY:
 * - Allow major AI crawlers for developer tool discoverability
 * - Block aggressive/commercial crawlers (CCBot, Amazonbot)
 * - Protect API endpoints and sensitive paths
 * 
 * MONITORING:
 * - Track crawler behavior via analytics
 * - Monitor for compliance with robots.txt directives
 * - Update list as new crawlers emerge
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Default rules for all crawlers
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/', 
          '/_next/',
          '/debug/',
          '/private/',
        ],
      },
      // OpenAI Crawlers (2025) - ALLOWED for developer tool visibility
      {
        userAgent: 'GPTBot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'OAI-SearchBot', 
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'ChatGPT-User/2.0',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      // Anthropic/Claude Crawlers (2025) - ALLOWED
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
        crawlDelay: 2,
      },
      {
        userAgent: 'Claude-User',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'Claude-SearchBot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'anthropic-ai',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'claude-web',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      // Google Gemini (2025) - ALLOWED
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'Gemini-Ai',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'Gemini-Deep-Research',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      // Perplexity (2025) - ALLOWED (though they may ignore robots.txt)
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'Perplexity-User',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      // Other AI Crawlers - ALLOWED for developer tool ecosystem
      {
        userAgent: 'Meta-ExternalAgent',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'MistralAI-User',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      {
        userAgent: 'xAI-Bot',
        allow: '/',
        disallow: ['/api/', '/debug/', '/private/'],
      },
      // Search Engines - ALLOWED
      {
        userAgent: 'Googlebot',
        allow: '/',
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
      },
      {
        userAgent: 'DuckDuckBot',
        allow: '/',
      },
      // Block aggressive/problematic crawlers
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
    ],
    sitemap: 'https://www.vibemanager.app/sitemap.xml',
    host: 'https://www.vibemanager.app',
  };
}
/**
 * Centralized Metadata Management System
 *
 * This file provides type-safe metadata definitions and helper functions
 * for generating consistent metadata across all pages.
 */

import type { Metadata } from 'next';
import type { Locale } from '@/i18n/config';
import { cdnUrl } from '@/lib/cdn';

// Base metadata that all pages should have
export const BASE_METADATA = {
  siteName: 'PlanToCode',
  siteUrl: 'https://www.plantocode.com',
  defaultImage: {
    url: cdnUrl('/images/og-image.png'),
    width: 1200,
    height: 630,
    alt: 'PlanToCode - AI Planning for Code',
  },
  twitterHandle: '@helpfulbits_com',
  defaultTitle: 'PlanToCode - AI Planning for Code',
  defaultDescription: 'Plan and ship code changes with AI. Find files, generate and merge AI plans from multiple models, run them in a persistent terminal. Free app with pay-as-you-go usage.',
} as const;

/**
 * Truncate a string to a maximum length with ellipsis
 */
function truncate(s: string, max: number): string {
  if (!s) return s;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Ensure title is present and within optimal length (max 60 chars)
 */
function safeTitle(title?: string, fallback?: string): string {
  const t = (title ?? '').trim();
  const base = t.length > 0 ? t : (fallback ?? '').trim();
  return truncate(base, 60);
}

/**
 * Ensure description is present and within optimal length (120-155 chars)
 */
function safeDescription(description?: string, fallback?: string): string {
  const d = (description ?? '').trim();
  const base = d.length >= 120 ? d : (fallback ?? '').trim() || d;
  return truncate(base, 155);
}

/**
 * Normalize pathname to prevent trailing slash issues
 * Converts '/' to empty string, keeps other paths as-is
 */
function normalizePath(pathname: string): string {
  return pathname === '/' ? '' : pathname;
}

/**
 * Generate locale-aware URL for a given pathname
 */
export function localizedUrl(pathname: string, locale: Locale): string {
  const normalizedPath = normalizePath(pathname);

  if (locale === 'en') {
    return normalizedPath;
  }

  // For non-English locales, always add locale prefix
  // Home page: '/de', other pages: '/de/slug'
  return `/${locale}${normalizedPath}`;
}

/**
 * Build language alternates for a pathname
 *
 * SEO Strategy: Generate hreflang tags for all available locales.
 * Each locale points to its respective localized URL.
 * English (en) has no locale prefix as it's the default locale.
 * x-default points to the English version.
 *
 * This ensures proper hreflang implementation without duplicate entries.
 */
export function buildAlternates(pathname: string): {
  en: string;
  de: string;
  es: string;
  fr: string;
  ja: string;
  ko: string;
  'x-default': string;
} {
  const siteUrl = BASE_METADATA.siteUrl.replace(/\/$/, '');

  // Build URLs using the localized URL helper for consistency
  const enUrl = `${siteUrl}${localizedUrl(pathname, 'en')}`;
  const deUrl = `${siteUrl}${localizedUrl(pathname, 'de')}`;
  const esUrl = `${siteUrl}${localizedUrl(pathname, 'es')}`;
  const frUrl = `${siteUrl}${localizedUrl(pathname, 'fr')}`;
  const jaUrl = `${siteUrl}${localizedUrl(pathname, 'ja')}`;
  const koUrl = `${siteUrl}${localizedUrl(pathname, 'ko')}`;

  // Build initial alternates object
  const alternates = {
    en: enUrl,
    de: deUrl,
    es: esUrl,
    fr: frUrl,
    ja: jaUrl,
    ko: koUrl,
    'x-default': enUrl,
  };

  // Deduplicate URLs - remove duplicate entries to prevent hreflang errors
  // This is especially important for homepage where en and x-default would be identical
  const urlMap = new Map<string, string[]>();
  Object.entries(alternates).forEach(([locale, url]) => {
    if (!urlMap.has(url)) {
      urlMap.set(url, []);
    }
    urlMap.get(url)!.push(locale);
  });

  // If there are no duplicates, return as-is
  if (urlMap.size === Object.keys(alternates).length) {
    return alternates;
  }

  // Build deduplicated alternates (keeping first occurrence of each URL)
  const deduped: Record<string, string> = {};
  const seenUrls = new Set<string>();

  for (const [locale, url] of Object.entries(alternates)) {
    if (!seenUrls.has(url) || locale === 'x-default') {
      deduped[locale] = url;
      seenUrls.add(url);
    }
  }

  return deduped as typeof alternates;
}

/**
 * Generate complete page metadata with locale support
 *
 * SEO Strategy (CORRECTED for proper i18n):
 * - Canonical URL is self-referencing (each locale points to itself)
 * - For /de/features, canonical is https://www.plantocode.com/de/features
 * - For /features (en), canonical is https://www.plantocode.com/features
 * - Hreflang alternates include all available locales
 * - OpenGraph locale matches the page locale
 * - x-default points to English version
 */
export function generatePageMetadata(opts: {
  locale: Locale;
  slug: string;
  title: string;
  description?: string;
  images?: Array<{
    url: string;
    width?: number;
    height?: number;
    alt?: string;
  }>;
}): Metadata {
  const {
    locale,
    slug,
    title,
    description = '',
    images = [BASE_METADATA.defaultImage],
  } = opts;

  // Apply safety fallbacks
  const safePageTitle = safeTitle(title, BASE_METADATA.defaultTitle);
  const safePageDescription = safeDescription(description, BASE_METADATA.defaultDescription);

  // Build pathname (slug should start with /)
  const pathname = slug.startsWith('/') ? slug : `/${slug}`;

  // Generate self-referencing canonical URL for the current locale
  const siteUrl = BASE_METADATA.siteUrl.replace(/\/$/, '');
  const canonical = `${siteUrl}${localizedUrl(pathname, locale)}`;

  // Build alternates - includes all locales for proper hreflang
  const alternateUrls = buildAlternates(pathname);

  // Determine OpenGraph locale values
  const ogLocale = locale === 'de' ? 'de_DE' : locale === 'fr' ? 'fr_FR' : locale === 'es' ? 'es_ES' : locale === 'ko' ? 'ko_KR' : locale === 'ja' ? 'ja_JP' : 'en_US';
  // Include all other locales as alternates (excluding current locale)
  const allOgLocales = ['en_US', 'de_DE', 'fr_FR', 'es_ES', 'ko_KR', 'ja_JP'];
  const ogAlternateLocale = allOgLocales.filter(l => l !== ogLocale);

  return {
    title: safePageTitle,
    description: safePageDescription,
    openGraph: {
      title: safePageTitle,
      description: safePageDescription,
      url: canonical, // Self-referencing URL
      siteName: BASE_METADATA.siteName,
      images: images.map(img => ({
        url: img.url,
        width: img.width || BASE_METADATA.defaultImage.width,
        height: img.height || BASE_METADATA.defaultImage.height,
        alt: img.alt || BASE_METADATA.defaultImage.alt,
      })),
      locale: ogLocale,
      alternateLocale: ogAlternateLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: safePageTitle,
      description: safePageDescription,
      images: images.map(img => ({
        url: img.url,
        alt: img.alt || BASE_METADATA.defaultImage.alt,
        width: img.width || BASE_METADATA.defaultImage.width,
        height: img.height || BASE_METADATA.defaultImage.height,
      })),
      creator: BASE_METADATA.twitterHandle,
      site: BASE_METADATA.twitterHandle,
    },
    alternates: {
      canonical,
      languages: alternateUrls,
    },
  };
}

// Common keywords that can be reused
export const COMMON_KEYWORDS = {
  core: [
    'ai code planning',
    'implementation planning',
    'plan mode',
    'ai coding assistant',
    'code generation',
  ],
  cliTools: [
    'cursor cli',
    'claude code',
    'codex cli',
    'gemini cli',
  ],
  features: [
    'file discovery',
    'voice transcription',
    'integrated terminal',
    'implementation plans',
    'text improvement',
  ],
  teamFeatures: [
    'human-in-the-loop ai',
    'corporate ai governance',
    'ai plan approval workflow',
    'team collaboration',
  ],
  models: [
    'gpt-5 planning',
    'claude sonnet 4',
    'gemini 2.5 pro',
    'multi model planning',
  ],
} as const;

export interface ContentMetadataOptions {
  title: string;
  description: string;
  type: 'blog' | 'solution' | 'feature' | 'comparison' | 'docs' | 'landing';
  slug: string;
  keywords?: string[];
  image?: {
    url: string;
    width?: number;
    height?: number;
    alt?: string;
  };
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  locale?: Locale;
}


/**
 * Generate complete metadata object for a page
 */
export function generateMetadata(options: ContentMetadataOptions): Metadata {
  const {
    title,
    description,
    type,
    slug,
    keywords = [],
    image = BASE_METADATA.defaultImage,
    publishedTime,
    modifiedTime,
    authors = ['PlanToCode Team'],
    locale = 'en',
  } = options;

  // Apply safety fallbacks
  const safeMetaTitle = safeTitle(title, BASE_METADATA.defaultTitle);
  const safeMetaDescription = safeDescription(description, BASE_METADATA.defaultDescription);

  // Determine the base path for canonical URL
  const getBasePath = () => {
    switch (type) {
      case 'blog':
        return 'blog';
      case 'solution':
        return 'solutions';
      case 'feature':
        return 'features';
      case 'comparison':
        return 'compare';
      case 'docs':
        return 'docs';
      case 'landing':
        return '';
      default:
        return '';
    }
  };

  const basePath = getBasePath();

  // Generate canonical path for the current locale (self-referencing)
  const baseCanonicalPath = basePath
    ? `/${basePath}/${slug}`
    : `/${slug}`;

  // Canonical URL is self-referencing (points to current locale)
  const canonicalPath = localizedUrl(baseCanonicalPath, locale);

  // Remove trailing slash from siteUrl if present
  const siteUrl = BASE_METADATA.siteUrl.replace(/\/$/, '');

  // Build full canonical URL - self-referencing to current locale
  const canonicalUrl = `${siteUrl}${canonicalPath}`;

  // Create language alternate URLs - includes all locales
  const languageAlternates = buildAlternates(baseCanonicalPath);

  // Determine OpenGraph locale values
  const ogLocale = locale === 'de' ? 'de_DE' : locale === 'fr' ? 'fr_FR' : locale === 'es' ? 'es_ES' : locale === 'ko' ? 'ko_KR' : locale === 'ja' ? 'ja_JP' : 'en_US';
  // Include all other locales as alternates (excluding current locale)
  const allOgLocales = ['en_US', 'de_DE', 'fr_FR', 'es_ES', 'ko_KR', 'ja_JP'];
  const ogAlternateLocale = allOgLocales.filter(l => l !== ogLocale);

  const metadata: Metadata = {
    title: safeMetaTitle,
    description: safeMetaDescription,
    keywords: keywords.length > 0 ? keywords : undefined,
    openGraph: {
      title: safeMetaTitle,
      description: safeMetaDescription,
      url: canonicalUrl, // Self-referencing
      siteName: BASE_METADATA.siteName,
      images: [{
        url: image.url,
        width: image.width || BASE_METADATA.defaultImage.width,
        height: image.height || BASE_METADATA.defaultImage.height,
        alt: image.alt || BASE_METADATA.defaultImage.alt,
      }],
      locale: ogLocale,
      alternateLocale: ogAlternateLocale,
      type: type === 'blog' || type === 'docs' ? 'article' : 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: safeMetaTitle,
      description: safeMetaDescription,
      images: [{
        url: image.url,
        alt: image.alt || BASE_METADATA.defaultImage.alt,
        width: image.width || BASE_METADATA.defaultImage.width,
        height: image.height || BASE_METADATA.defaultImage.height,
      }],
      creator: BASE_METADATA.twitterHandle,
      site: BASE_METADATA.twitterHandle,
    },
    alternates: {
      canonical: canonicalUrl,
      languages: languageAlternates,
    },
  };

  // Add article-specific metadata
  if ((type === 'blog' || type === 'docs') && (publishedTime || modifiedTime)) {
    metadata.openGraph = {
      ...metadata.openGraph,
      type: 'article',
      publishedTime,
      modifiedTime,
      authors,
    };
  }

  return metadata;
}

/**
 * Quick metadata generators for common page types
 */
export const metadataPresets = {
  /**
   * Generate metadata for a blog post
   */
  blog: (options: {
    title: string;
    description: string;
    slug: string;
    keywords?: string[];
    publishedTime?: string;
  }): Metadata => {
    return generateMetadata({
      ...options,
      type: 'blog',
      keywords: [
        ...(options.keywords || []),
        ...COMMON_KEYWORDS.core,
      ],
    });
  },

  /**
   * Generate metadata for a solution page
   */
  solution: (options: {
    title: string;
    description: string;
    slug: string;
    keywords?: string[];
  }): Metadata => {
    return generateMetadata({
      ...options,
      type: 'solution',
      keywords: [
        ...(options.keywords || []),
        ...COMMON_KEYWORDS.core,
        ...COMMON_KEYWORDS.teamFeatures,
      ],
    });
  },

  /**
   * Generate metadata for a feature page
   */
  feature: (options: {
    title: string;
    description: string;
    slug: string;
    keywords?: string[];
  }): Metadata => {
    return generateMetadata({
      ...options,
      type: 'feature',
      keywords: [
        ...(options.keywords || []),
        ...COMMON_KEYWORDS.core,
        ...COMMON_KEYWORDS.features,
      ],
    });
  },

  /**
   * Generate metadata for a comparison page
   */
  comparison: (options: {
    title: string;
    description: string;
    slug: string;
    toolNames: string[];
  }): Metadata => {
    const comparisonKeywords = options.toolNames.map(tool =>
      `${tool.toLowerCase()} vs plantocode`
    );

    return generateMetadata({
      ...options,
      type: 'comparison',
      keywords: [
        ...comparisonKeywords,
        'ai coding tool comparison',
        'best coding assistant',
        ...COMMON_KEYWORDS.core,
      ],
    });
  },

  /**
   * Generate metadata for a documentation page
   */
  docs: (options: {
    title: string;
    description: string;
    slug: string;
    keywords?: string[];
  }): Metadata => {
    return generateMetadata({
      ...options,
      type: 'docs',
      keywords: [
        ...(options.keywords || []),
        'documentation',
        'guide',
        'tutorial',
        ...COMMON_KEYWORDS.core,
      ],
    });
  },
};

/**
 * Validate metadata for completeness
 * Returns an array of validation errors (empty if valid)
 */
export function validateMetadata(metadata: Metadata): string[] {
  const errors: string[] = [];

  if (!metadata.title) {
    errors.push('Missing required field: title');
  } else if (typeof metadata.title === 'string' && metadata.title.length > 60) {
    errors.push(`Title too long (${metadata.title.length} chars, max 60): "${metadata.title}"`);
  }

  if (!metadata.description) {
    errors.push('Missing required field: description');
  } else if (typeof metadata.description === 'string' && (metadata.description.length < 120 || metadata.description.length > 160)) {
    errors.push(
      `Description length suboptimal (${metadata.description.length} chars, recommended 150-160): "${metadata.description}"`
    );
  }

  if (!metadata.openGraph?.title) {
    errors.push('Missing OpenGraph title');
  }

  if (!metadata.openGraph?.description) {
    errors.push('Missing OpenGraph description');
  }

  if (!metadata.openGraph?.images || (Array.isArray(metadata.openGraph.images) && metadata.openGraph.images.length === 0)) {
    errors.push('Missing OpenGraph images');
  }

  if (!metadata.twitter) {
    errors.push('Missing Twitter card type');
  }

  if (!metadata.alternates?.canonical) {
    errors.push('Missing canonical URL');
  }

  return errors;
}

/**
 * Helper to merge additional keywords with common ones
 */
export function mergeKeywords(
  ...keywordSets: (string[] | readonly string[])[]
): string[] {
  const allKeywords = keywordSets.flat();
  // Remove duplicates while preserving order
  return Array.from(new Set(allKeywords));
}

/**
 * Generate breadcrumb schema for SEO
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Generate FAQ schema for SEO
 */
export function generateFAQSchema(
  faqs: Array<{ question: string; answer: string }>
) {
  return {
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Generate Article schema for blog posts
 */
export function generateArticleSchema(options: {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  author: string;
  image?: string;
}) {
  return {
    '@type': 'Article',
    headline: options.headline,
    description: options.description,
    url: options.url,
    datePublished: options.datePublished,
    dateModified: options.dateModified || options.datePublished,
    author: {
      '@type': 'Person',
      name: options.author,
    },
    publisher: {
      '@type': 'Organization',
      name: BASE_METADATA.siteName,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE_METADATA.siteUrl}/images/icon.png`,
      },
    },
    image: options.image || BASE_METADATA.defaultImage.url,
  };
}

/**
 * Generate complete SoftwareApplication schema
 */
export function generateSoftwareApplicationSchema(options?: {
  name?: string;
  url?: string;
  description?: string;
}) {
  return {
    '@type': 'SoftwareApplication',
    name: options?.name || 'PlanToCode',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: options?.url || BASE_METADATA.siteUrl,
    description: options?.description || 'Plan and ship code changes - find files, generate and merge AI plans from multiple models, run them in a persistent terminal.',
    softwareVersion: '1.0.23',
    downloadUrl: `${BASE_METADATA.siteUrl}/downloads`,
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Free app with pay-as-you-go API usage. $5 free credits on signup.',
      availability: 'https://schema.org/InStock',
    },
    creator: {
      '@type': 'Organization',
      name: BASE_METADATA.siteName,
      url: BASE_METADATA.siteUrl
    },
    featureList: [
      'File Discovery',
      'Multi-Model AI Planning',
      'Plan Merge & Review',
      'Integrated Terminal',
      'Voice Transcription',
      'Video Analysis'
    ]
  };
}

/**
 * Generate complete Organization schema
 */
export function generateOrganizationSchema() {
  return {
    '@type': 'Organization',
    name: BASE_METADATA.siteName,
    url: BASE_METADATA.siteUrl,
    logo: {
      '@type': 'ImageObject',
      url: `${BASE_METADATA.siteUrl}/images/icon.webp`,
      width: '512',
      height: '512'
    },
    description: 'Plan and ship code changes - find files, generate and merge AI plans from multiple models, run them in a persistent terminal.',
    foundingDate: '2024',
    sameAs: [
      'https://github.com/plantocode',
      'https://twitter.com/helpfulbits_com',
      'https://x.com/helpfulbits_com'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      url: `${BASE_METADATA.siteUrl}/support`,
      availableLanguage: ['English', 'German', 'French', 'Spanish', 'Japanese', 'Korean']
    },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'US'
    }
  };
}

/**
 * Generate HowTo schema with proper step structure
 */
export function generateHowToSchema(options: {
  name: string;
  description: string;
  steps: Array<{ name: string; text: string }>;
}) {
  return {
    '@type': 'HowTo',
    name: options.name,
    description: options.description,
    step: options.steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

// Export types for use in pages
export type { Metadata } from 'next';

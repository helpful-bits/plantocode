/**
 * Centralized Metadata Management System
 *
 * This file provides type-safe metadata definitions and helper functions
 * for generating consistent metadata across all pages.
 */

import type { Metadata } from 'next';
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
  twitterHandle: '@plantocode',
} as const;

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
  } = options;

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
  const canonicalUrl = basePath
    ? `${BASE_METADATA.siteUrl}/${basePath}/${slug}`
    : `${BASE_METADATA.siteUrl}/${slug}`;

  const metadata: Metadata = {
    title,
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: BASE_METADATA.siteName,
      images: [{
        url: image.url,
        width: image.width || BASE_METADATA.defaultImage.width,
        height: image.height || BASE_METADATA.defaultImage.height,
        alt: image.alt || BASE_METADATA.defaultImage.alt,
      }],
      locale: 'en_US',
      type: type === 'blog' || type === 'docs' ? 'article' : 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{
        url: image.url,
        alt: image.alt || BASE_METADATA.defaultImage.alt,
      }],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'en-US': canonicalUrl,
        'en': canonicalUrl,
      },
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

// Export types for use in pages
export type { Metadata } from 'next';

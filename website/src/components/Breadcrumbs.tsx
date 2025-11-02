import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StructuredData } from '@/components/seo/StructuredData';
import type { BreadcrumbList } from 'schema-dts';

interface BreadcrumbItem {
  label: string;
  href?: string | undefined;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  includeHome?: boolean;
}

/**
 * Universal Breadcrumbs component with schema.org BreadcrumbList markup
 * Works for docs, PSEO pages, blog posts, and all other content
 */
export function Breadcrumbs({ items, includeHome = true }: BreadcrumbsProps) {
  // Build the breadcrumb list starting with Home if requested
  const breadcrumbs: BreadcrumbItem[] = includeHome
    ? [{ label: 'Home', href: '/' }, ...items]
    : items;

  // Don't render if there's only one breadcrumb (just Home)
  if (breadcrumbs.length <= 1) return null;

  // Generate schema.org BreadcrumbList
  const breadcrumbSchema: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs
      .filter((item): item is BreadcrumbItem & { href: string } => !!item.href) // Only include items with hrefs
      .map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.label,
        item: `https://www.plantocode.com${item.href}`,
      })),
  };

  return (
    <>
      <StructuredData data={breadcrumbSchema} />
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-sm text-foreground/60 mb-6"
      >
        <ol className="flex items-center gap-2">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <li key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <ChevronRight className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                )}

                {isLast ? (
                  <span
                    className="text-foreground font-medium"
                    aria-current="page"
                  >
                    {item.label}
                  </span>
                ) : item.href ? (
                  <Link
                    href={item.href}
                    className="hover:text-foreground transition-colors"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-foreground/60">{item.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}

/**
 * Build breadcrumbs from a URL path
 * Useful for dynamic pages
 */
export function buildBreadcrumbsFromPath(
  pathname: string,
  labels?: Record<string, string>
): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [];

  let currentPath = '';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;

    currentPath += `/${segment}`;

    // Use custom label if provided, otherwise format the segment
    const label =
      labels?.[segment] ||
      segment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

    // Only add href for non-last items
    breadcrumbs.push({
      label,
      href: i < segments.length - 1 ? currentPath : undefined,
    });
  }

  return breadcrumbs;
}

/**
 * Build breadcrumbs for PSEO pages with category context
 */
export function buildPseoBreadcrumbs(
  category: string,
  pageTitle: string,
  categoryPath?: string
): BreadcrumbItem[] {
  const categoryLabel = category
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return [
    {
      label: categoryLabel,
      href: categoryPath || `/${category}`,
    },
    {
      label: pageTitle,
    },
  ];
}

/**
 * Build breadcrumbs for docs pages
 */
export function buildDocsBreadcrumbs(
  segments: string[],
  labels?: Record<string, string>
): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: 'Docs',
      href: '/docs',
    },
  ];

  let currentPath = '/docs';
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;

    currentPath += `/${segment}`;

    const label =
      labels?.[segment] ||
      segment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

    breadcrumbs.push({
      label,
      href: i < segments.length - 1 ? currentPath : undefined,
    });
  }

  return breadcrumbs;
}

/**
 * Build breadcrumbs for solution pages
 */
export function buildSolutionBreadcrumbs(solutionTitle: string): BreadcrumbItem[] {
  return [
    {
      label: 'Solutions',
      href: '/solutions',
    },
    {
      label: solutionTitle,
    },
  ];
}

/**
 * Build breadcrumbs for blog posts
 */
export function buildBlogBreadcrumbs(postTitle: string): BreadcrumbItem[] {
  return [
    {
      label: 'Blog',
      href: '/blog',
    },
    {
      label: postTitle,
    },
  ];
}

'use client';

import { Link, getPathname } from '@/i18n/navigation';
import { ChevronRight } from 'lucide-react';
import { StructuredData } from '@/components/seo/StructuredData';
import { useMessages } from '@/components/i18n/useMessages';
import type { BreadcrumbList } from 'schema-dts';
import type { BreadcrumbItem } from '@/components/breadcrumbs/utils';

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  includeHome?: boolean;
}

/**
 * Universal Breadcrumbs component with schema.org BreadcrumbList markup
 * Works for docs, PSEO pages, blog posts, and all other content
 */
export function Breadcrumbs({ items, includeHome = true }: BreadcrumbsProps) {
  const { t, locale } = useMessages();

  // Build the breadcrumb list starting with Home if requested
  const breadcrumbs: BreadcrumbItem[] = includeHome
    ? [{ label: t('breadcrumb.home', 'Home'), href: '/' }, ...items]
    : items;

  // Don't render if there's only one breadcrumb (just Home)
  if (breadcrumbs.length <= 1) return null;

  // Generate schema.org BreadcrumbList with locale-aware URLs
  const base = 'https://www.plantocode.com';
  const breadcrumbSchema: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs
      .filter((item): item is BreadcrumbItem & { href: string } => !!item.href) // Only include items with hrefs
      .map((item, index) => {
        const localizedPath = getPathname({ href: item.href, locale });
        const absoluteUrl = `${base}${localizedPath}`;
        return {
          '@type': 'ListItem',
          position: index + 1,
          name: item.label,
          item: absoluteUrl,
        };
      }),
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

'use client';

import { usePathname } from 'next/navigation';
import { buildBreadcrumbs } from '@/lib/docs-nav';

export function DocsLayoutJsonLd() {
  const pathname = usePathname();
  const breadcrumbs = buildBreadcrumbs(pathname);
  
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Docs',
        item: 'https://www.plantocode.com/docs'
      },
      ...breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 2,
        name: crumb.title,
        item: `https://www.plantocode.com${crumb.slug}`
      }))
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
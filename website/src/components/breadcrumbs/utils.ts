interface BreadcrumbItem {
  label: string;
  href?: string | undefined;
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
 * Note: Pass the translated 'Docs' label from the consuming component
 */
export function buildDocsBreadcrumbs(
  segments: string[],
  labels?: Record<string, string>,
  docsLabel: string = 'Docs'
): BreadcrumbItem[] {
  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: docsLabel,
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
 * Build breadcrumbs for feature pages
 */
export function buildFeatureBreadcrumbs(featureTitle: string, featuresLabel: string = 'Features'): BreadcrumbItem[] {
  return [
    {
      label: featuresLabel,
      href: '/features',
    },
    {
      label: featureTitle,
    },
  ];
}

// Simple hub builder: one crumb after Home
export function buildHubBreadcrumbs(label: string) {
  return [{ label }];
}

export type { BreadcrumbItem };

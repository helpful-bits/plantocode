import { docsManifest, type DocItem, type DocGroup } from '@/docs/docs-manifest';

export function flattenDocs(groups: DocGroup[]): DocItem[] {
  const result: DocItem[] = [];
  
  function traverse(items: (DocItem | DocGroup)[]) {
    for (const item of items) {
      if ('slug' in item) {
        result.push(item);
      } else if ('items' in item && item.items) {
        traverse(item.items);
      }
    }
  }
  
  traverse(groups);
  return result;
}

export function slugIndex(flat: DocItem[]): Map<string, number> {
  const index = new Map<string, number>();
  flat.forEach((item, i) => {
    index.set(item.slug, i);
  });
  return index;
}

export function getPrevNext(currentSlug: string): { prev?: DocItem | undefined; next?: DocItem | undefined } {
  const flat = flattenDocs(docsManifest);
  const index = slugIndex(flat);
  const currentIndex = index.get(currentSlug);
  
  if (currentIndex === undefined) {
    return {};
  }
  
  const result: { prev?: DocItem | undefined; next?: DocItem | undefined } = {};
  
  if (currentIndex > 0) {
    result.prev = flat[currentIndex - 1];
  }
  
  if (currentIndex < flat.length - 1) {
    result.next = flat[currentIndex + 1];
  }
  
  return result;
}

export function buildBreadcrumbs(currentSlug: string): Array<{ slug: string; title: string }> {
  const breadcrumbs: Array<{ slug: string; title: string }> = [];
  
  function findPath(items: (DocItem | DocGroup)[], parentTitle?: string): boolean {
    for (const item of items) {
      if ('slug' in item && item.slug === currentSlug) {
        if (parentTitle) {
          breadcrumbs.push({ slug: '/docs', title: parentTitle });
        }
        breadcrumbs.push({ slug: item.slug, title: item.title });
        return true;
      } else if ('items' in item && item.items) {
        if (findPath(item.items, item.title)) {
          return true;
        }
      }
    }
    return false;
  }
  
  findPath(docsManifest);
  return breadcrumbs;
}

export function findNodeBySlug(slug: string): DocItem | undefined {
  const flat = flattenDocs(docsManifest);
  return flat.find(item => item.slug === slug);
}

export function getSidebarData(): DocGroup[] {
  return docsManifest;
}
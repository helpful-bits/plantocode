export const MEDIA_CDN_BASE = process.env.NEXT_PUBLIC_MEDIA_CDN_BASE || 'https://d2tyb0wucqqf48.cloudfront.net';

export function cdnUrl(path: string): string {
  const basePath = MEDIA_CDN_BASE.replace(/\/$/, '');
  const relativePath = path.replace(/^\//, '');
  return `${basePath}/${relativePath}`;
}
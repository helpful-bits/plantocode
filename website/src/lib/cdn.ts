export const MEDIA_CDN_BASE = process.env.NEXT_PUBLIC_MEDIA_CDN_BASE || 'https://d2tyb0wucqqf48.cloudfront.net';

/**
 * Returns CDN URL for videos and downloads, local path for images.
 *
 * - Videos (.mp4, .webm, etc.) → served from CloudFront CDN
 * - Desktop downloads (.dmg, .exe, etc.) → served from CDN
 * - Images and other assets → served locally from git-tracked public folder
 */
export function cdnUrl(path: string): string {
  const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(path);
  const isDownload = /\.(dmg|exe|msi|tar\.gz|zip)$/i.test(path) || path.includes('/desktop/');

  if (isVideo || isDownload) {
    const basePath = MEDIA_CDN_BASE.replace(/\/$/, '');
    const relativePath = path.replace(/^\//, '');
    return `${basePath}/${relativePath}`;
  }

  // Images served locally from public folder (tracked in git)
  return path.startsWith('/') ? path : `/${path}`;
}
/**
 * Extract client IP from request headers with proper fallback chain
 * Priority: CF-Connecting-IP → X-Forwarded-For → X-Real-IP → ''
 */
export function getClientIpFromHeaders(h: Headers | HeadersInit): string {
  const headers = h instanceof Headers ? h : new Headers(h as any);
  
  // Cloudflare
  const cf = headers.get('cf-connecting-ip') || headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();

  // Standard proxy header (take first IP if multiple)
  const xff = headers.get('x-forwarded-for') || headers.get('X-Forwarded-For');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }

  // Nginx real IP
  const xri = headers.get('x-real-ip') || headers.get('X-Real-IP');
  if (xri) return xri.trim();

  return '';
}
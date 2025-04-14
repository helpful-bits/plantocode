
/**
 */
export function hashString(str: string): string {
  // Treat empty string or 'global' as 'global' consistently
  if (str === 'global' || !str) return 'global';
  let hash = 5381; // djb2 seed
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string and take first 8 characters
  return (hash >>> 0).toString(16).padStart(8, '0'); // Pad to ensure consistent length
} 
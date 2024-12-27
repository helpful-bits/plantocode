/**
 * Simple string hashing function that works in the browser
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string and take first 8 characters
  return (hash >>> 0).toString(16).slice(0, 8);
} 
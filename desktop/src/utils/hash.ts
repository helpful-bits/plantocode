/**
 * Simple DJB2 hash function to generate a consistent hash for strings */
export function hashString(str: string | null | undefined): string {
  // Accept null/undefined
  // Treat null, undefined, empty string, or 'global' as 'global' consistently
  if (str === "global" || !str) return "global";
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string and pad to ensure consistent length
  return (hash >>> 0).toString(16).padStart(8, "0"); // Pad to ensure consistent length
}

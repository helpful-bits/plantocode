/**
 * Format a file size in bytes to a human-readable size with appropriate units
 * @param bytes File size in bytes (can be undefined/null for unknown sizes)
 * @param decimals Number of decimal places (default: 1)
 * @returns Human-readable file size string (e.g., "1.5 KB", "2.3 MB", "N/A" for unknown)
 */
export function humanFileSize(bytes: number | undefined | null, decimals: number = 1): string {
  if (bytes === undefined || bytes === null) return "N/A";
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

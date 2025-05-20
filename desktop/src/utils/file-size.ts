/**
 * Format a file size in bytes to a human-readable size with appropriate units
 * @param bytes File size in bytes
 * @param decimals Number of decimal places (default: 1)
 * @returns Human-readable file size string (e.g., "1.5 KB", "2.3 MB")
 */
export function humanFileSize(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

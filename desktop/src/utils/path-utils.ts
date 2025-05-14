/**
 * Desktop-specific path utilities to replace Node.js path module functionality
 * These utilities are compatible with browser environments
 */

/**
 * Simplifies a path by normalizing slashes and removing redundant parts.
 * This is the core normalization function focusing ONLY on formatting, not path relationships.
 *
 * @param filePath The file path to normalize
 * @param addTrailingSlash If true, ensures the path ends with a slash
 * @returns A normalized path with consistent slash formatting
 */
export function normalizePath(filePath: string, addTrailingSlash = false): string {
  if (!filePath) return filePath;

  let normalizedPath = filePath;

  // Convert backslashes to forward slashes
  normalizedPath = normalizedPath.replace(/\\/g, '/');

  // Replace multiple consecutive slashes with a single one
  normalizedPath = normalizedPath.replace(/\/\/+/g, '/');

  // Add trailing separator if requested and not already present
  if (addTrailingSlash && !normalizedPath.endsWith('/')) {
    normalizedPath += '/';
  }

  return normalizedPath;
}

/**
 * Browser-compatible replacement for path.join
 * Joins path segments together and normalizes the resulting path
 * 
 * @param paths Path segments to join
 * @returns Joined path with normalized slashes
 */
export function join(...paths: string[]): string {
  // Filter out empty segments
  const segments = paths.filter(segment => segment !== '');
  
  if (segments.length === 0) return '';
  
  // Join with forward slashes and normalize
  const joined = segments.join('/');
  
  // Replace consecutive slashes with a single one
  return normalizePath(joined);
}

/**
 * Browser-compatible replacement for path.basename
 * Gets the file name portion of a path
 * 
 * @param filePath The file path
 * @returns The file name
 */
export function basename(filePath: string): string {
  if (!filePath) return '';
  
  // Normalize the path first
  const normalizedPath = normalizePath(filePath);
  
  // Split by slashes and get the last part
  const parts = normalizedPath.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Browser-compatible replacement for path.extname
 * Gets the file extension of a path
 * 
 * @param filePath The file path
 * @returns The file extension with the leading dot
 */
export function extname(filePath: string): string {
  const fileName = basename(filePath);
  const dotIndex = fileName.lastIndexOf('.');
  
  if (dotIndex === -1 || dotIndex === 0) return '';
  
  return fileName.substring(dotIndex);
}

/**
 * Browser-compatible replacement for path.dirname
 * Gets the directory name of a path
 * 
 * @param filePath The file path
 * @returns The directory name
 */
export function dirname(filePath: string): string {
  if (!filePath) return '';
  
  // Normalize the path
  const normalizedPath = normalizePath(filePath);
  
  // Remove trailing slashes
  const withoutTrailing = normalizedPath.replace(/\/+$/, '');
  
  // Find the last slash
  const lastSlashIndex = withoutTrailing.lastIndexOf('/');
  
  if (lastSlashIndex === -1) return '.';
  
  // If the last slash is the first character, return "/"
  if (lastSlashIndex === 0) return '/';
  
  // Return everything before the last slash
  return withoutTrailing.substring(0, lastSlashIndex);
}

/**
 * Returns a fixed app directory for use in place of process.cwd()
 * In a real Tauri app, this would be replaced with Tauri's path API calls
 * 
 * @returns A placeholder directory path
 */
export function getAppDirectory(): string {
  // In a real implementation, this would use Tauri's API to get app directory
  // For now, just return a placeholder that won't break existing code
  return '/app';
}

/**
 * A browser-compatible replacement for requiring the file system path resolution
 * For Tauri apps, you would implement this using Tauri's filesystem API
 * 
 * @param outputType The type of output (e.g., 'patches', 'implementation_plans')
 * @param filename The output filename
 * @returns The resolved path for the output file
 */
export function resolveOutputFilePath(filename: string, outputType: string): string {
  return join(getAppDirectory(), 'generated_outputs', outputType, filename);
}
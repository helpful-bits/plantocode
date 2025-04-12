/**
 * Path utilities for handling different operating systems
 */

import path from "path";

/**
 * Gets a best-guess default path based on the current operating system
 * @param username Optional username for the path
 * @returns A default path appropriate for the detected OS
 */
export function getDefaultPathForOS(username?: string): string {
  // Default username if not provided
  const user = username || '';
  
  // Check for operating system
  if (navigator.platform.includes('Win')) {
    return `C:\\Users\\${user}\\`;
  } else if (navigator.platform.includes('Mac')) {
    return `/Users/${user}/`;
  } else {
    // Linux or other Unix-like OS
    return `/home/${user}/`;
  }
}

/**
 * Normalizes file paths to ensure consistent handling throughout the application
 * 
 * @param filePath The file path to normalize
 * @param baseDir Optional base directory to make paths relative to (if applicable)
 * @param addTrailingSlash Whether to add a trailing slash if missing (default: false)
 * @returns A normalized path for consistent comparison
 */
export function normalizePath(filePath: string, baseDir?: string, addTrailingSlash: boolean = false): string {
  if (!filePath) return filePath;
  
  let normalizedPath = filePath;
  
  // For absolute paths that should be relative to the base directory
  if (baseDir && path.isAbsolute(normalizedPath) && normalizedPath.startsWith(baseDir)) {
    normalizedPath = path.relative(baseDir, normalizedPath);
  }
  
  // Use forward slashes for consistency across platforms
  normalizedPath = normalizedPath.replace(/\\/g, '/');
  
  // Add trailing separator if requested
  if (addTrailingSlash && !normalizedPath.endsWith('/')) {
    normalizedPath += '/';
  }
  
  return normalizedPath;
}

/**
 * Joins path segments with appropriate separator for the OS
 * @param segments Path segments to join
 * @returns Joined path
 */
export function joinPath(...segments: string[]): string {
  const isWindows = navigator.platform.includes('Win');
  const separator = isWindows ? '\\' : '/';
  
  return segments
    .filter(segment => segment)
    .join(separator);
}

/**
 * Extracts the directory name from a path
 * @param path The path
 * @returns The directory name
 */
export function getDirectoryName(path: string): string {
  if (!path) return '';
  
  // Remove trailing slashes
  path = path.replace(/[\/\\]$/, '');
  
  // Find last separator
  const lastSeparatorIndex = Math.max(
    path.lastIndexOf('/'),
    path.lastIndexOf('\\')
  );
  
  if (lastSeparatorIndex === -1) {
    return path; // No separator found, return the whole path
  }
  
  return path.substring(lastSeparatorIndex + 1);
}

/**
 * Ensures a path is properly displayed in the UI
 * This can be helpful for showing more user-friendly paths
 * 
 * @param filePath The file path to format for display
 * @returns A path formatted for display purposes
 */
export function formatPathForDisplay(filePath: string): string {
  if (!filePath) return '';
  
  // Replace home directory with ~ on Unix systems (just for display)
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && filePath.startsWith(home)) {
    return filePath.replace(home, '~');
  }
  
  return filePath;
}

/**
 * Maps file paths between formats to handle situations where the same file 
 * might be referenced by different paths (absolute vs relative)
 * 
 * @param files An array of file paths to normalize
 * @param baseDir The project base directory
 * @returns An object mapping original paths to normalized paths
 */
export function createPathMapping(files: string[], baseDir?: string): { [key: string]: string } {
  const mapping: { [key: string]: string } = {};
  
  for (const file of files) {
    const normalized = normalizePath(file, baseDir);
    mapping[file] = normalized;
  }
  
  return mapping;
} 
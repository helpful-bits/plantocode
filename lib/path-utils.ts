/**
 * Path utilities primarily for browser environment context
 */
 // Use basic string manipulation for browser context

/**
 * Gets a best-guess default path based on the browser's platform info
 * @param username Optional username hint
 * @returns A default path appropriate for the detected OS
 */
export function getDefaultPathForOS(username?: string): string {
  // Default username if not provided
  const user = username || '';

  if (typeof navigator === 'undefined') { // Check if running on server
    return process.cwd(); // Fallback for server-side
  }
  
  // Check for operating system
  if (typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('WIN')) {
    return `C:\\Users\\${user}\\`;
  } else if (typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')) {
    return `/Users/${user}/`;
  } else {
    // Linux or other Unix-like OS
    return `/home/${user}/`;
  }
}

/**
 * Formats a file path for display by making it relative to the base directory
 * @param filePath The file path to format
 * @param baseDir Optional base directory to make path relative to
 * @returns A formatted path suitable for display in the UI
 */
export function formatPathForDisplay(filePath: string, baseDir?: string): string {
  return normalizePath(filePath, baseDir);
}

/**
 * Normalizes file paths to ensure consistent handling throughout the application
 * using forward slashes and handling relative paths against a base directory.
 *
 * @param filePath The file path to normalize
 * @param baseDir Optional base directory to make paths relative to (if applicable)
 * @returns A normalized path for consistent comparison
 */
export function normalizePath(filePath: string, baseDir?: string, addTrailingSlash = false): string {
  if (!filePath) return filePath;
  
  let normalizedPath = filePath;
  
  // Convert backslashes to forward slashes
  normalizedPath = normalizedPath.replace(/\\/g, '/');

  // If baseDir is provided, try to make the path relative
  if (baseDir) {
    // Normalize baseDir as well
    let normBaseDir = baseDir.replace(/\\/g, '/');
    // Ensure baseDir ends with a slash for accurate startsWith comparison
    if (!normBaseDir.endsWith('/')) {
      normBaseDir += '/';
    }

    // If the filePath starts with the baseDir, make it relative
    if (normalizedPath.startsWith(normBaseDir)) {
      normalizedPath = normalizedPath.substring(normBaseDir.length);
    }
  }
  
  // Add trailing separator if requested
  if (addTrailingSlash && !normalizedPath.endsWith('/')) {
    normalizedPath += '/';
  }
  
  return normalizedPath;
}

/**
 * Extracts the directory name from a path
 * @param path The path
 * @returns The directory name
 */
export function getDirectoryName(filePath: string): string {
    if (!filePath) return ''; // Return empty string if path is empty
  
    // Remove trailing slashes
    const cleanedPath = filePath.replace(/[\/\\]$/, '');

    // Find last separator
    const lastSeparatorIndex = Math.max(
        cleanedPath.lastIndexOf('/'),
        cleanedPath.lastIndexOf('\\')
    );

    if (lastSeparatorIndex === -1) {
        return cleanedPath; // No separator found, return the whole path
    }
    
    return cleanedPath.substring(0, lastSeparatorIndex);
}

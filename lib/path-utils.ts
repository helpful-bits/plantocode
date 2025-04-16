/**
 * Path utilities primarily for browser environment context
 */
 // Use basic string manipulation for browser context
import path from 'path';

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
export function normalizePath(filePath: string, baseDir?: string | null, addTrailingSlash = false): string {
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
    if (normBaseDir !== '/' && normalizedPath.startsWith(normBaseDir)) { // Avoid stripping root paths accidentally
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

/**
 * Returns the path to the patches directory in the project directory
 * @param projectDirectory Path to the project directory
 * @returns Path to the patches directory within the project
 */
export function getProjectPatchesDirectory(projectDirectory: string): string {
  if (!projectDirectory) {
    throw new Error('Project directory is required');
  }
  return path.join(projectDirectory, 'patches');
}

/**
 * Returns the path to the fallback patches directory in the application directory
 * @returns Path to the application's patches directory
 */
export function getAppPatchesDirectory(): string {
  return path.join(process.cwd(), 'patches');
}

/**
 * Resolves a patch filename to a full path in either project directory or app directory
 * @param filename The patch filename
 * @param projectDirectory Optional project directory
 * @returns The full path to the patch file
 */
export function resolvePatchPath(filename: string, projectDirectory?: string): string {
  if (projectDirectory) {
    const projectPath = path.join(projectDirectory, 'patches', filename);
    // Note: This doesn't check existence, just creates the path
    return projectPath;
  }
  
  return path.join(process.cwd(), 'patches', filename);
}

/**
 * Extracts just the filename from a full patch path
 * @param patchPath Full path to a patch file
 * @returns Just the filename
 */
export function getPatchFilename(patchPath: string): string {
  return path.basename(patchPath);
}

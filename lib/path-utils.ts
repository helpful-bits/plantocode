/**
 * Path utilities primarily for browser environment context
 */
import path from 'path';

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
  normalizedPath = normalizedPath.replace(/\/\/+/g, '/'); // Replace multiple slashes with single

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
  
  // Add trailing separator if requested and not already present
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
 * This directory is used for XML files that contain changes to be applied
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
 * Directory name for implementation plans
 */
export const IMPLEMENTATION_PLANS_DIR_NAME = 'implementation_plans';

/**
 * Returns the path to the implementation plans directory in the project directory
 * This directory is used for XML files containing implementation plans
 * @param projectDirectory Path to the project directory
 * @returns Path to the implementation plans directory within the project
 */
export function getProjectImplementationPlansDirectory(projectDirectory: string): string {
  if (!projectDirectory) {
    throw new Error('Project directory is required');
  }
  return path.join(projectDirectory, IMPLEMENTATION_PLANS_DIR_NAME);
}

/**
 * Returns the path to the fallback patches directory in the application directory
 * This directory is used for XML files when project directory is not accessible
 * @returns Path to the application's patches directory
 */
export function getAppPatchesDirectory(): string {
  return path.join(process.cwd(), 'patches');
}

/**
 * Resolves a patch or XML filename to a full path in either project directory or app directory
 * @param filename The XML filename
 * @param projectDirectory Optional project directory
 * @returns The full path to the XML file
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
 * Extracts just the filename from a full path
 * @param filePath Full path to a file
 * @returns Just the filename
 */
export function getPatchFilename(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Checks if a filename has an XML extension
 * @param filename The filename to check
 * @returns True if the file has an XML extension
 */
export function isXmlFile(filename: string): boolean {
  return /\.xml$/i.test(filename);
}

/**
 * Gets the extension of a file
 * @param filename The filename to check
 * @returns The file extension (without the dot)
 */
export function getFileExtension(filename: string): string {
  const ext = path.extname(filename);
  return ext ? ext.substring(1).toLowerCase() : '';
}

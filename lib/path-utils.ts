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
 * Normalizes a file path for consistent comparison across the application.
 * This creates a canonical string format for comparing paths:
 * - Uses forward slashes
 * - Removes leading ./ or /
 * - Removes redundant slashes
 * - Trims whitespace
 * 
 * @param filePath The file path to normalize
 * @returns A normalized path in canonical format for consistent comparison
 */
export function normalizePathForComparison(filePath: string): string {
  if (!filePath) return '';
  
  let normalizedPath = filePath;
  
  // Trim whitespace
  normalizedPath = normalizedPath.trim();
  
  // Convert backslashes to forward slashes
  normalizedPath = normalizedPath.replace(/\\/g, '/');
  
  // Replace multiple consecutive slashes with a single one
  normalizedPath = normalizedPath.replace(/\/\/+/g, '/');
  
  // Remove leading ./ if present
  if (normalizedPath.startsWith('./')) {
    normalizedPath = normalizedPath.substring(2);
  }
  
  // Remove leading / if present (assuming paths are relative to project root)
  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.substring(1);
  }
  
  return normalizedPath;
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
 * Returns the path to the output files directory in the project directory
 * This directory is used for generated output files like patches, implementation plans, etc.
 * @param projectDirectory Path to the project directory
 * @returns Path to the output files directory within the project
 */
export function getProjectOutputFilesDirectory(projectDirectory: string): string {
  if (!projectDirectory) {
    throw new Error('Project directory is required');
  }
  return path.join(projectDirectory, 'generated_outputs');
}

/**
 * Directory name for implementation plans
 */
export const IMPLEMENTATION_PLANS_DIR_NAME = 'implementation_plans';

/**
 * Returns the path to the implementation plans directory in the project directory
 * This directory is used for generated implementation plans
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
 * Returns the path to the fallback outputs directory in the application directory
 * @returns Path to the application's output files directory
 */
export function getAppOutputFilesDirectory(): string {
  return path.join(process.cwd(), 'generated_outputs');
}

/**
 * Resolves an output filename to a full path in the output files directory
 * @param filename The output filename
 * @param outputType Type of output (e.g., 'patches', 'implementation_plans')
 * @param projectDirectory Optional project directory
 * @returns The full path to the output file
 */
export function resolveOutputFilePath(filename: string, outputType: string, projectDirectory?: string): string {
  if (projectDirectory) {
    const projectPath = path.join(projectDirectory, 'generated_outputs', outputType, filename);
    // Note: This doesn't check existence, just creates the path
    return projectPath;
  }
  
  return path.join(process.cwd(), 'generated_outputs', outputType, filename);
}

/**
 * Extracts just the filename from a full path
 * @param filePath Full path to a file
 * @returns Just the filename
 */
export function getFilename(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Checks if a filename has a specific extension
 * @param filename The filename to check
 * @param extension The extension to check for (default is XML)
 * @returns True if the file has the specified extension
 */
export function hasFileExtension(filename: string, extension: string = 'xml'): boolean {
  const regex = new RegExp(`\\.${extension}$`, 'i');
  return regex.test(filename);
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
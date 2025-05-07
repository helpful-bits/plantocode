/**
 * Path utilities primarily for browser environment context
 */
import path from 'path';

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
 * Makes an absolute path relative to a project root directory.
 * If the path is not within the project root, returns the original path.
 * 
 * @param absolutePath The absolute file path to make relative
 * @param projectRoot The absolute path to the project root directory
 * @returns A path relative to the project root or the original path if not within the project
 */
export function makePathRelative(absolutePath: string, projectRoot: string): string {
  if (!absolutePath || !projectRoot) return absolutePath;
  
  // Normalize both paths for consistent comparison
  const normalizedPath = normalizePath(absolutePath);
  let normalizedRoot = normalizePath(projectRoot);
  
  // Ensure root ends with a slash for accurate startsWith comparison
  if (!normalizedRoot.endsWith('/')) {
    normalizedRoot += '/';
  }

  // If the path starts with the project root, make it relative
  if (normalizedRoot !== '/' && normalizedPath.startsWith(normalizedRoot)) {
    return normalizedPath.substring(normalizedRoot.length);
  }
  
  // Path is not within the project root, return original
  return absolutePath;
}

/**
 * Resolves a relative or absolute path against a project root.
 * If the path is already absolute, returns it unchanged.
 * If it's relative, resolves it against the project root.
 * 
 * @param relativePathOrAbsolute A path which could be relative or absolute
 * @param projectRoot The absolute path to the project root directory
 * @returns A resolved absolute path
 */
export function resolvePath(relativePathOrAbsolute: string, projectRoot: string): string {
  if (!relativePathOrAbsolute) return relativePathOrAbsolute;
  if (!projectRoot) return relativePathOrAbsolute;
  
  // Check if the path is already absolute
  const normalizedPath = normalizePath(relativePathOrAbsolute);
  
  // For Windows-style absolute paths (C:\path\to\file)
  if (/^[A-Za-z]:[\\\/]/.test(normalizedPath)) {
    return normalizedPath;
  }
  
  // For Unix-style absolute paths (/path/to/file)
  if (normalizedPath.startsWith('/')) {
    return normalizedPath;
  }
  
  // It's a relative path, resolve against project root
  return path.join(projectRoot, normalizedPath);
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
 * Formats a file path for display by making it relative to the base directory
 * @param filePath The file path to format
 * @param baseDir Optional base directory to make path relative to
 * @returns A formatted path suitable for display in the UI
 */
export function formatPathForDisplay(filePath: string, baseDir?: string): string {
  if (!filePath) return '';
  
  // If baseDir is provided, make the path relative to it
  if (baseDir) {
    return makePathRelative(filePath, baseDir);
  }
  
  // Otherwise just normalize the path
  return normalizePath(filePath);
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
 * Returns the absolute path to the output files directory in the project directory
 * This directory is used for generated output files like patches, implementation plans, etc.
 * @param projectDirectory Absolute path to the project directory
 * @returns Absolute path to the output files directory within the project
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
 * Returns the absolute path to the implementation plans directory in the project directory
 * This directory is used for generated implementation plans
 * @param projectDirectory Absolute path to the project directory
 * @returns Absolute path to the implementation plans directory within the project
 */
export function getProjectImplementationPlansDirectory(projectDirectory: string): string {
  if (!projectDirectory) {
    throw new Error('Project directory is required');
  }
  return path.join(projectDirectory, IMPLEMENTATION_PLANS_DIR_NAME);
}

/**
 * Returns the absolute path to the fallback outputs directory in the application directory
 * @returns Absolute path to the application's output files directory
 */
export function getAppOutputFilesDirectory(): string {
  return path.join(process.cwd(), 'generated_outputs');
}

/**
 * Resolves an output filename to a full absolute path in the output files directory
 * @param filename The output filename
 * @param outputType Type of output (e.g., 'patches', 'implementation_plans')
 * @param projectDirectory Optional absolute project directory path
 * @returns The full absolute path to the output file
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
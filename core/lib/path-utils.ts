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
 * Extracts file paths from a response containing XML tags
 *
 * @param responseText The response text containing XML tags with file paths
 * @param projectDirectory Optional project directory to make paths relative to
 * @returns Array of extracted (and potentially relativized) file paths
 */
export function extractFilePathsFromTags(
  responseText: string,
  projectDirectory?: string
): string[] {
  const paths: string[] = [];

  // Match <file path="..."> or <file>path</file> patterns
  const filePathRegex = /<file(?:\s+path="([^"]+)"|[^>]*)>(?:([^<]+)<\/file>)?/g;
  let match;

  while ((match = filePathRegex.exec(responseText)) !== null) {
    const attributePath = match[1]; // path from attribute
    const contentPath = match[2]; // path from content

    if (attributePath) {
      const trimmedPath = attributePath.trim();
      // If projectDirectory is provided and path is absolute, try to make it relative
      if (projectDirectory && (trimmedPath.startsWith('/') || /^[A-Za-z]:[\\\/]/.test(trimmedPath))) {
        paths.push(makePathRelative(trimmedPath, projectDirectory));
      } else {
        paths.push(trimmedPath);
      }
    } else if (contentPath) {
      const trimmedPath = contentPath.trim();
      // If projectDirectory is provided and path is absolute, try to make it relative
      if (projectDirectory && (trimmedPath.startsWith('/') || /^[A-Za-z]:[\\\/]/.test(trimmedPath))) {
        paths.push(makePathRelative(trimmedPath, projectDirectory));
      } else {
        paths.push(trimmedPath);
      }
    }
  }

  return paths;
}

/**
 * Extracts file paths without relying on XML tags
 *
 * @param responseText The response text to extract paths from
 * @param projectDirectory Optional project directory to make paths relative to
 * @returns Array of extracted (and potentially relativized) file paths
 */
export function extractPotentialFilePaths(
  responseText: string,
  projectDirectory?: string
): string[] {
  const paths: string[] = [];

  // Split by newlines and process each line
  const lines = responseText.split('\n');

  // Common file extensions to help identify legitimate paths
  const commonExtensions = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
    '.go', '.rb', '.php', '.html', '.css', '.scss', '.json', '.xml', '.yaml',
    '.yml', '.md', '.txt', '.sh', '.bat', '.ps1', '.sql', '.graphql', '.prisma',
    '.vue', '.svelte', '.dart', '.kt', '.swift', '.m', '.rs', '.toml'
  ]);

  // Regex to identify invalid path characters
  const invalidPathChars = /[<>:"|?*\x00-\x1F]/;

  // Regex to detect line formatting that's likely not a file path
  const nonPathLineFormats = /^(note|remember|important|tip|hint|warning|error|caution|attention|info):/i;

  // Regex to match common code file pattern: [dir/]file.ext
  const filePathPattern = /^(?:(?:\.{1,2}\/)?[\w-]+\/)*[\w-]+\.\w+$/;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines, lines that look like XML tags, or commented lines
    if (!trimmedLine ||
        trimmedLine.startsWith('<') ||
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('/*') ||
        trimmedLine.startsWith('*')) {
      continue;
    }

    // Skip lines that are likely prose or instructions
    if (nonPathLineFormats.test(trimmedLine)) {
      continue;
    }

    // Remove numbering/bullets at the start of lines (common in LLM responses)
    const cleanedLine = trimmedLine.replace(/^[\d\.\s-]+/, '').trim();

    // Skip if it's empty after cleaning
    if (!cleanedLine) continue;

    // Skip lines that look like they're just regular text (too many spaces, parentheses, etc.)
    if (cleanedLine.split(' ').length > 2) continue;

    // Skip if it's too short to be a valid path
    if (cleanedLine.length < 4) continue;

    // Skip lines that don't look like file paths (no extension or directory separator)
    if (!cleanedLine.includes('.') && !cleanedLine.includes('/')) continue;

    // Require at least one path separator to avoid single filenames
    if (!cleanedLine.includes('/') && !cleanedLine.includes('\\')) continue;

    // Check for common file extensions
    const hasValidExtension = Array.from(commonExtensions).some(ext =>
      cleanedLine.toLowerCase().endsWith(ext)
    );

    // Skip if no valid extension found and it doesn't look like a directory path
    if (!hasValidExtension && !cleanedLine.endsWith('/')) continue;

    // Skip paths with invalid characters
    if (invalidPathChars.test(cleanedLine)) continue;

    // Skip extremely long paths (likely not valid)
    if (cleanedLine.length > 255) continue;

    // Skip if the line contains HTML/Markdown formatting
    if (cleanedLine.includes('</') || cleanedLine.includes('](')) continue;

    // Skip likely descriptive text that happens to contain periods and slashes
    if (cleanedLine.includes(':') && !cleanedLine.includes(':/')) continue;

    // Apply stricter regex pattern for common file path format
    if (!filePathPattern.test(cleanedLine) &&
        !cleanedLine.startsWith('/') &&
        !cleanedLine.startsWith('./') &&
        !cleanedLine.startsWith('../')) {
      continue;
    }

    // Check if it has a minimum number of path segments for typical codebase paths
    const pathSegments = cleanedLine.split('/').filter(Boolean);
    if (pathSegments.length < 2 && !cleanedLine.startsWith('./')) continue;

    // Process the path: if it's absolute and we have a project directory, make it relative
    if (projectDirectory && (cleanedLine.startsWith('/') || /^[A-Za-z]:[\\\/]/.test(cleanedLine))) {
      paths.push(makePathRelative(cleanedLine, projectDirectory));
    } else {
      // Already relative or we don't have a project directory
      paths.push(cleanedLine);
    }
  }

  return paths;
}

/**
 * Parse file paths from an AI response
 * @param responseText The AI response text to parse paths from
 * @param projectDirectory Optional project directory to make paths relative to
 * @returns Array of normalized file paths
 */
export function parseFilePathsFromAIResponse(responseText: string, projectDirectory?: string): string[] {
  if (!responseText) return [];

  // First try extracting paths from XML tags
  const tagPaths = extractFilePathsFromTags(responseText, projectDirectory);

  // If we found paths in XML tags, return those
  if (tagPaths.length > 0) {
    return tagPaths;
  }

  // Otherwise try to extract potential file paths from the text
  const potentialPaths = extractPotentialFilePaths(responseText, projectDirectory);

  // Return the normalized paths
  return potentialPaths.map(path => normalizePathForComparison(path)).filter(Boolean);
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
 * Directory name for implementation plans (DEPRECATED - kept for backwards compatibility)
 * @deprecated Implementation plans are now stored in the database
 */
export const IMPLEMENTATION_PLANS_DIR_NAME = 'implementation_plans';

/**
 * Returns the absolute path to the implementation plans directory in the project directory
 * This directory is deprecated as implementation plans are now stored in the database
 * @deprecated Implementation plans are now stored in the database
 * @param projectDirectory Absolute path to the project directory
 * @returns Absolute path to the implementation plans directory within the project
 */
export function getProjectImplementationPlansDirectory(projectDirectory: string): string {
  if (!projectDirectory) {
    throw new Error('Project directory is required');
  }
  console.warn('DEPRECATED: Implementation plans are now stored in the database, not in files');
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
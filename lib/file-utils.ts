import { promises as fs } from 'fs';
import path from 'path';

/**
 * Checks if a buffer likely represents a binary file.
 * It looks for null bytes or a high percentage of non-printable ASCII characters.
 */
export async function isBinaryFile(buffer: Buffer): Promise<boolean> {
  if (buffer.length === 0) return false; // Empty file is not binary

  // Check for null byte, a strong indicator of binary content
  const hasNullByte = buffer.includes(0);
  if (hasNullByte) return true;

  // Check ratio of non-printable characters (excluding tab, LF, CR)
  const nonPrintable = buffer.filter(byte => (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte >= 127);
  const ratio = nonPrintable.length / buffer.length;

  // If more than 10% are non-printable, assume binary
  return ratio > 0.1;
}

export const BINARY_EXTENSIONS = new Set([ // Keep BINARY_EXTENSIONS
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp', // Images
  '.mp3', '.mp4', '.wav', '.ogg', '.mov', '.avi', // Audio/Video
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', // Documents
  '.zip', '.tar', '.gz', '.7z', '.rar', // Archives
  '.jar', '.war', '.ear', // Java Archives
  '.ttf', '.woff', '.woff2', '.otf', '.eot', // Fonts
  '.map', // Source maps
  '.exe', '.dll', '.so', '.dylib', // Executables/Libraries
  '.db', '.sqlite', '.sqlite3', // Databases
  '.wasm', // WebAssembly
  '.pyc', // Python compiled
  '.lockb', // pnpm lockfile binary variant
]);

/**
 * Helper function to validate a file path, checking for existence, size, and binary content
 */
export async function validateFilePath(
  filePath: string, 
  fileContents: Record<string, string>, 
  projectDirectory: string,
  allFiles?: string[]
): Promise<boolean> {
  try {
    // Skip empty paths
    if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
      console.warn(`[PathFinder] Skipping empty file path`);
      return false;
    }
    
    // Normalize path to handle different formats
    const normalizedPath = filePath.replace(/\\/g, '/').trim();
    
    // First check if we already have the content in our map
    if (fileContents[normalizedPath]) {
      // Skip binary files by checking the extension
      const ext = path.extname(normalizedPath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        console.debug(`[PathFinder] Skipping binary file by extension: ${normalizedPath}`);
        return false;
      }
      
      // We already have the content, so we can check if it's binary
      const content = fileContents[normalizedPath];
      if (!content) return false;
      
      try {
        const isBinary = await isBinaryFile(Buffer.from(content));
        return !isBinary;
      } catch (err) {
        console.debug(`[PathFinder] Error checking binary content for ${normalizedPath}: ${err}`);
        return false;
      }
    } else {
      // Check if the path exists in our known files list
      if (allFiles && allFiles.length > 0) {
        const fileExists = allFiles.includes(normalizedPath);
        if (!fileExists) {
          console.debug(`[PathFinder] Path does not exist in project files: ${normalizedPath}`);
          return false;
        }
        
        // Skip binary files by checking the extension
        const ext = path.extname(normalizedPath).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          console.debug(`[PathFinder] Skipping binary file by extension: ${normalizedPath}`);
          return false;
        }
        
        // Try to read the file to check if it's binary or too large
        try {
          // Resolve the full path correctly
          let fullPath;
          if (path.isAbsolute(normalizedPath)) {
            fullPath = normalizedPath;
          } else {
            fullPath = path.join(projectDirectory, normalizedPath);
          }
          
          // Check file size first
          const stats = await fs.stat(fullPath).catch(error => {
            console.debug(`[PathFinder] File stat error for ${normalizedPath}: ${error.code || error.message}`);
            return null;
          });
          
          // Skip if stats couldn't be retrieved or if the file is too large
          if (!stats) {
            return false;
          }
          
          // Skip files that are too large (>10MB) to avoid memory issues
          if (stats.size > 10 * 1024 * 1024) {
            console.warn(`[PathFinder] Skipping large file (${Math.round(stats.size / 1024 / 1024)}MB): ${normalizedPath}`);
            return false;
          }
          
          // Try to read the file and check if it's binary
          const content = await fs.readFile(fullPath);
          const isBinary = await isBinaryFile(content);
          
          if (isBinary) {
            console.debug(`[PathFinder] Skipping detected binary file: ${normalizedPath}`);
            return false;
          }
          
          return true;
        } catch (readError) {
          // Handle file reading errors (permissions, etc)
          console.debug(`[PathFinder] Could not read file: ${normalizedPath}`, readError);
          return false;
        }
      }
      
      // If no allFiles provided, the path is not valid
      console.debug(`[PathFinder] No file list provided to validate against: ${normalizedPath}`);
      return false;
    }
  } catch (error) {
    // Skip files with any other issues
    console.debug(`[PathFinder] Error processing file: ${filePath}`, error);
    return false;
  }
}

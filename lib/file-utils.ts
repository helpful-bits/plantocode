import { promises as fs } from 'fs';
import path from 'path';
import { normalizePathForComparison } from './path-utils';
import { existsSync } from 'fs';
import { join } from 'path';
import { readFile, stat } from 'fs/promises';

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
  // Count non-printable characters by iterating over the buffer
  let nonPrintableCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if ((byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte >= 127) {
      nonPrintableCount++;
    }
  }
  
  const ratio = nonPrintableCount / buffer.length;

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
 * Load file contents for a list of files with batching, timeouts, and size limits
 * @param projectDirectory The absolute path to the base directory for the files
 * @param filePaths Array of project-relative file paths to load
 * @param existingContents Optional existing file contents map to use as a base
 * @returns A record mapping project-relative file paths to their contents
 */
export async function loadFileContents(
  projectDirectory: string,
  filePaths: string[],
  existingContents: Record<string, string> = {}
): Promise<Record<string, string>> {
  if (!filePaths.length) {
    return existingContents;
  }

  // Loading file contents
  
  // Start with the existing contents
  const contents: Record<string, string> = { ...existingContents };
  
  // Configuration to prevent reading extremely large files
  const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file
  const FILE_READ_TIMEOUT = 2000;   // 2 seconds timeout per file
  
  // Function to read file with timeout
  const readFileWithTimeout = async (path: string, timeoutMs: number): Promise<string> => {
    // Create a promise that rejects after the timeout
    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error(`File read timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    // Create the file read promise
    const readPromise = readFile(path, 'utf-8');
    
    // Race the promises - whichever resolves/rejects first wins
    return Promise.race([readPromise, timeoutPromise]);
  };
  
  // Process files concurrently in batches
  const BATCH_SIZE = 5; // Process up to 5 files at once
  const filePathBatches = [];
  
  // Create batches of file paths
  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    filePathBatches.push(filePaths.slice(i, i + BATCH_SIZE));
  }
  
  // Process each batch sequentially
  for (let batchIndex = 0; batchIndex < filePathBatches.length; batchIndex++) {
    const batch = filePathBatches[batchIndex];
    // Processing file batch
    
    // Process files in the current batch concurrently
    const batchPromises = batch.map(async (filePath) => {
      try {
        // Resolve the relative path to an absolute path using the project directory
        const fullPath = join(projectDirectory, filePath);
        
        // Verify the file exists before trying to read it
        if (existsSync(fullPath)) {
          // Processing file
          
          // Check file size first
          try {
            const fileStats = await stat(fullPath);
            if (fileStats.size > MAX_FILE_SIZE) {
              // File too large, truncating
              // Read just the first part of large files
              const fileContent = await readFileWithTimeout(fullPath, FILE_READ_TIMEOUT);
              contents[filePath] = fileContent.substring(0, MAX_FILE_SIZE) + 
                `\n\n... [File truncated, ${Math.round(fileStats.size / 1024)}KB total] ...`;
            } else {
              // File is within size limits
              const fileContent = await readFileWithTimeout(fullPath, FILE_READ_TIMEOUT);
              contents[filePath] = fileContent;
            }
          } catch (timeoutError) {
            console.error(`Timeout reading file ${filePath}:`, timeoutError);
            contents[filePath] = "[File read timed out - too large or locked by another process]";
          }
        } else {
          console.error(`File does not exist: ${fullPath}`);
          contents[filePath] = `[File not found: ${fullPath}]`;
        }
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        // Add a placeholder indicating the file couldn't be read
        contents[filePath] = `[Error reading file: ${error instanceof Error ? error.message : String(error)}]`;
      }
    });
    
    // Wait for all files in this batch to be processed
    await Promise.all(batchPromises);
  }
  
  // File loading complete
  
  return contents;
}

/**
 * Helper function to validate a file path, checking for existence, size, and binary content
 * 
 * @param filePath Project-relative file path to validate
 * @param fileContents Record mapping project-relative paths to their contents
 * @param projectDirectory Absolute path to project directory
 * @param allFiles Optional list of known project-relative file paths
 * @returns Boolean indicating if the path is valid and not binary
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
    
    // Normalize path using the canonical path normalization function
    const normalizedPath = normalizePathForComparison(filePath);
    
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
          // Resolve the full path (always use project directory as base for normalized path)
          const fullPath = path.join(projectDirectory, normalizedPath);
          
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

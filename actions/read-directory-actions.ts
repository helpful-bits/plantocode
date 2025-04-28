"use server";

import { promises as fs } from "fs";
import path from "path"; // Keep path import
import { getAllNonIgnoredFiles, invalidateFileCache } from "@/lib/git-utils";
import { isBinaryFile, BINARY_EXTENSIONS } from "@/lib/file-utils";
import { ActionState } from "@/types";
import streamingRequestPool, { RequestType } from "@/lib/api/streaming-request-pool";

const DEBUG_LOGS = process.env.NODE_ENV === 'development'; // Enable logs in development

// Define a more resilient directoryCache for caching directory contents
// Use a class to better manage the cache lifecycle
class DirectoryCache {
  private cache = new Map<string, { data: { [key: string]: string }, timestamp: number }>();
  private TTL = 60000; // Cache TTL in milliseconds (e.g., 60 seconds)
  private isHotReloading = false;
  private lastHotReloadCheck = 0;
  private HOT_RELOAD_CHECK_INTERVAL = 5000; // Don't check for hot reload more than every 5 seconds

  constructor() {
    // Check if we're potentially in a hot reload scenario
    // This will be called when the module is first loaded or reloaded
    this.checkHotReload();
  }

  /**
   * Check if we're in a hot reload scenario
   */
  private checkHotReload() {
    const now = Date.now();
    // Only check at a reasonable interval
    if (now - this.lastHotReloadCheck < this.HOT_RELOAD_CHECK_INTERVAL) {
      return;
    }
    
    this.lastHotReloadCheck = now;
    this.isHotReloading = this.detectHotReload();
    
    if (this.isHotReloading && DEBUG_LOGS) {
      console.log('[DirectoryCache] Hot reload detected, extending cache TTL');
    }
  }
  
  /**
   * Simple detection for hot reload scenarios
   */
  private detectHotReload(): boolean {
    const stack = new Error().stack || '';
    // During hot reload, the stack trace often includes specific patterns
    return stack.includes('webpack-internal:') || 
           stack.includes('HotModuleReplacement') ||
           stack.includes('next-dev');
  }
  
  /**
   * Set cache entry
   */
  set(key: string, data: { [key: string]: string }): void {
    this.cache.set(key, { 
      data, 
      timestamp: Date.now() 
    });
  }
  
  /**
   * Get cache entry if valid
   */
  get(key: string): { [key: string]: string } | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const now = Date.now();
    const age = now - entry.timestamp;
    
    // Apply longer TTL during hot reload to maintain stability
    const effectiveTTL = this.isHotReloading ? this.TTL * 2 : this.TTL;
    
    // Check if cache entry is still valid
    if (age < effectiveTTL) {
      return entry.data;
    }
    
    // Cache is expired
    if (DEBUG_LOGS) console.log(`[DirectoryCache] Cache expired for ${key} (age: ${age}ms)`);
    return null;
  }
  
  /**
   * Check if cache has valid entry
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }
  
  /**
   * Delete cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
}

// Create a single instance of the cache
const directoryCache = new DirectoryCache();

export async function readExternalFileAction(filePath: string): Promise<ActionState<{ [key: string]: string | Buffer }>> {
    try {
    if (!filePath) {
      return {
        isSuccess: false,
        message: "No file path provided"
      };
    }
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    // Use try-catch within the loop for individual file errors
    if (DEBUG_LOGS) console.log(`[Read External] Reading: ${fullPath}`);
    const ext = path.extname(fullPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      if (DEBUG_LOGS) console.log(`[Read External] Skipping binary extension: ${ext}`);
      return { isSuccess: false, message: `Skipping binary file: ${filePath}` };
    }

    const buffer = await fs.readFile(fullPath);
    if (await isBinaryFile(buffer)) {
      console.warn(`Skipping detected binary file: ${filePath}`);
      return { isSuccess: false, message: `Skipping binary file: ${filePath}` };
    }
    
    const fileInfo: { [key: string]: string } = {};
    fileInfo[filePath] = buffer.toString('utf-8'); // Read as UTF-8

    return {
      isSuccess: true,
      data: fileInfo,
      message: `Successfully read file: ${filePath}`
    };
  } catch (error: unknown) { // Use unknown type for catch block variable
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read file"
    };
  }
}

export async function readDirectoryAction(projectDirectory: string): Promise<ActionState<{ [key: string]: string }>> {
  // Use streamingRequestPool with FILE_OPERATION type to give this action highest priority
  return streamingRequestPool.execute(
    async () => {
      // Implementation of directory reading
      return await readDirectoryImplementation(projectDirectory);
    },
    'file-system', // Use a constant session ID for file system operations
    10, // High priority
    RequestType.FILE_OPERATION // Mark as file operation to ensure it takes priority
  );
}

// Separate implementation function for directory reading
async function readDirectoryImplementation(projectDirectory: string): Promise<ActionState<{ [key: string]: string }>> {
  const MAX_RETRIES = 2;
  let attempts = 0;

  while (attempts <= MAX_RETRIES) {
    try {
      const finalDirectory = projectDirectory?.trim();
      if (!finalDirectory) {
        return {
          isSuccess: false,
          message: "No project directory provided"
        };
      }

      // Check for cached results first
      if (directoryCache.has(finalDirectory)) {
        const cachedData = directoryCache.get(finalDirectory);
        if (cachedData) {
          if (DEBUG_LOGS) console.log(`[ReadDir] Using cached result for ${finalDirectory} with ${Object.keys(cachedData).length} files`);
          return {
            isSuccess: true,
            message: "Using cached directory content",
            data: cachedData
          };
        }
      }

      // Check if directory is accessible
      try {
        await fs.access(finalDirectory); // Check directory access
      } catch (accessError) {
        return { 
          isSuccess: false, 
          message: `Directory not found or inaccessible: ${finalDirectory}`, 
          data: {} 
        };
      }

      if (DEBUG_LOGS) console.log(`[ReadDir] Reading git repository files from ${finalDirectory} (attempt ${attempts + 1})`);
      
      // Get all files not in gitignore using git ls-files
      let files: string[] = [];
      let isGitRepo = false;
      
      try {
        const result = await getAllNonIgnoredFiles(finalDirectory);
        files = result.files;
        isGitRepo = result.isGitRepo;
        if (DEBUG_LOGS) console.log(`[ReadDir] Found ${files.length} non-ignored files`);
      } catch (gitError) {
        console.error(`[ReadDir] Error using git to list files:`, gitError);
        
        // If we have a cached version, use it as fallback during failures
        if (directoryCache.has(finalDirectory)) {
          const fallbackData = directoryCache.get(finalDirectory);
          if (fallbackData && Object.keys(fallbackData).length > 0) {
            console.log(`[ReadDir] Using cached fallback data after git error with ${Object.keys(fallbackData).length} files`);
            return {
              isSuccess: true,
              message: "Using cached data due to git operation failure",
              data: fallbackData
            };
          }
        }
        
        // Try again if we haven't reached max retries
        if (attempts < MAX_RETRIES) {
          attempts++;
          const delay = 500 * attempts; // Increasing delay for each retry
          console.log(`[ReadDir] Git command failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Try again
        }
        
        return {
          isSuccess: false,
          message: gitError instanceof Error ? gitError.message : "Failed to list files using git",
          data: {}
        };
      }
      
      const fileContents: { [key: string]: string } = {};
      
      // Process files in batches to avoid memory issues with large repositories
      const BATCH_SIZE = 200;
      let processedCount = 0; // Keep count
      let binaryCount = 0;
      let errorCount = 0;
      let deletedCount = 0;

      if (DEBUG_LOGS) console.log(`[Refresh] Processing ${files.length} files in batches of ${BATCH_SIZE}`);

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);

        for (const file of batch) {
          const fullPath = path.join(finalDirectory, file);
          
          // Skip binary files and known non-text extensions
          const ext = path.extname(file).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) {
            binaryCount++;
            continue;
          }

          try {
            // Check if file exists
            try {
              await fs.access(fullPath);
            } catch (error) {
              if (DEBUG_LOGS) console.warn(`[Refresh] File not found (likely deleted): ${fullPath}`);
              deletedCount++;
              continue;
            }
            
            const buffer = await fs.readFile(fullPath);
            
            // Skip binary files based on content analysis
            if (await isBinaryFile(buffer)) {
              binaryCount++;
              continue;
            }
            
            // Store relative path as key
            fileContents[file] = buffer.toString('utf-8');
            processedCount++;
          } catch (error: unknown) {
            errorCount++;
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'ENOENT') {
              if (DEBUG_LOGS) console.warn(`[Refresh] File not found (definitely deleted or renamed): ${file}`);
              deletedCount++;
            } else if (err.code === 'EACCES') {
              console.warn(`Permission denied when trying to read: ${file}`);
            } else {
              console.warn(`Failed to read file ${file}:`, err.message || err);
            }
          }
        } // End for loop (file of batch)
      } // End of batch processing loop
      
      const fileCount = Object.keys(fileContents).length;
      if (DEBUG_LOGS) console.log(`[Refresh] Processed ${fileCount} files. Binary: ${binaryCount}, Errors: ${errorCount}, Deleted: ${deletedCount}`);
      
      if (fileCount === 0) {
        // If we have a cached version, use it when no files are found
        if (directoryCache.has(finalDirectory)) {
          const fallbackData = directoryCache.get(finalDirectory);
          if (fallbackData && Object.keys(fallbackData).length > 0) {
            console.log(`[ReadDir] Using cached fallback - no text files found in fresh read`);
            return {
              isSuccess: true,
              message: "Using cached data - no readable text files found in fresh scan",
              data: fallbackData
            };
          }
        }

        // Try again if we haven't reached max retries
        if (attempts < MAX_RETRIES) {
          attempts++;
          const delay = 500 * attempts; // Increasing delay for each retry
          console.log(`[ReadDir] No files processed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Try again
        }
        
        return {
          isSuccess: false,
          message: "No text files could be read from the repository. Files may be binary or inaccessible.",
          data: {}
        };
      }
      
      // Store the result in cache
      directoryCache.set(finalDirectory, fileContents);
      
      return {
        isSuccess: true,
        message: `Successfully read ${fileCount} text files from the repository.`,
        data: fileContents
      };
    } catch (error: any) {
      console.error(`[ReadDir] Error reading directory (attempt ${attempts + 1}/${MAX_RETRIES + 1}):`, error);
      
      // Try again if we haven't reached max retries
      if (attempts < MAX_RETRIES) {
        attempts++;
        const delay = 500 * attempts; // Increasing delay for each retry
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // Try again
      }
      
      const errorMessage = error instanceof Error
        ? error.message
        : "An unknown error occurred while reading files";
      
      return {
        isSuccess: false,
        message: errorMessage,
        data: {}
      };
    }
  }
  
  // This should never be reached but TypeScript needs a return
  return {
    isSuccess: false,
    message: "Unexpected error: Maximum retries exceeded",
    data: {}
  };
}

// Helper function to read directory recursively
async function readDirectoryRecursive(directoryPath: string, basePath: string = ''): Promise<string[]> {
  try { // Keep try/catch block
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      // Skip hidden files and directories except .git (handled separately)
      if (entry.name.startsWith('.') && entry.name !== '.git') {
        continue;
      }
      
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
      
      if (entry.isDirectory()) { // Keep directory check
        // Skip node_modules and common build directories
        if (
          entry.name === 'node_modules' || 
          entry.name === 'dist' || 
          entry.name === 'build' ||
          entry.name === '.git'
        ) {
          continue;
        }

        try {
          const subFiles = await readDirectoryRecursive(entryPath, relativePath);
          files.push(...subFiles);
        } catch (error) {
          console.warn(`Skipping inaccessible directory: ${relativePath}`, error);
        }
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }

    return files;
  } catch (error) {
    console.error(`Error reading directory ${directoryPath}:`, error);
    return [];
  }
}

// Function to invalidate the directory cache
export async function invalidateDirectoryCache(directory?: string): Promise<void> {
  if (directory) {
    const trimmedDir = directory.trim();
    console.log(`[ReadDir Cache] Invalidating cache for directory: ${trimmedDir}`);
    directoryCache.delete(trimmedDir);
  } else { // Keep else block
    directoryCache.clear();
  }
}

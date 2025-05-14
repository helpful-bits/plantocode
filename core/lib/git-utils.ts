"use server";

import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { normalizePathForComparison, normalizePath } from "./path-utils";
import { BINARY_EXTENSIONS } from "./file-utils";

// Custom exec function with promise interface instead of using promisify
const execAsync = (command: string, options?: { cwd?: string }): Promise<{ stdout: string, stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        // Ensure stdout and stderr are strings
        resolve({ 
          stdout: stdout.toString(), 
          stderr: stderr.toString() 
        });
      }
    });
  });
};

// File cache with TTL to prevent frequent scans
const fileCache = new Map<string, { files: string[], timestamp: number, isGitRepo: boolean }>();
const CACHE_TTL = 30000; // 30 seconds cache lifetime
const DEBUG_LOGS = process.env.NODE_ENV === 'development'; // Enable logs in development

// Add a global variable to track hot reload state
let lastReloadTime = Date.now();
const HOT_RELOAD_COOLDOWN = 2000; // 2 seconds cooldown after hot reload

// Function to detect if we're in a potential hot reload scenario
function isInHotReloadCooldown(): boolean {
  const now = Date.now();
  const timeSinceReload = now - lastReloadTime;
  const inCooldown = timeSinceReload < HOT_RELOAD_COOLDOWN;

  if (DEBUG_LOGS && inCooldown) {
    console.log(`[Git Utils] In hot reload cooldown (${timeSinceReload}ms since last reload)`);
  }

  // Update the reload time regardless to ensure we track repeated hot reloads
  lastReloadTime = now;

  return inCooldown;
}

/**
 * Recursive directory traversal function with better error handling
 * Used as a fallback when git operations fail
 *
 * @param rootDir The root directory to start traversal from
 * @param currentRelativeDir The current relative directory path
 * @param exclusions Array of directory names to exclude
 * @returns Array of file paths relative to rootDir
 */
async function readdirRecursive(
  rootDir: string,
  currentRelativeDir: string = '',
  exclusions: string[] = ['node_modules', '.git', '.next', 'dist', 'build']
): Promise<string[]> {
  try {
    const currentDir = currentRelativeDir ? path.join(rootDir, currentRelativeDir) : rootDir;

    // Read the directory contents
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    let files: string[] = [];

    // Process each entry
    for (const entry of entries) {
      // Skip excluded directories
      if (entry.isDirectory() && exclusions.includes(entry.name)) {
        if (DEBUG_LOGS) {
          console.log(`[Git Utils] Skipping excluded directory: ${entry.name}`);
        }
        continue;
      }

      // Build the relative path for this entry
      const entryRelativePath = currentRelativeDir
        ? path.join(currentRelativeDir, entry.name)
        : entry.name;

      // Normalize the path for consistent use across platforms
      const normalizedRelativePath = normalizePathForComparison(entryRelativePath);

      if (entry.isDirectory()) {
        try {
          // Recursively scan subdirectories
          const subDirFiles = await readdirRecursive(rootDir, entryRelativePath, exclusions);
          files = files.concat(subDirFiles);
        } catch (error) {
          // Log subdirectory errors but continue with other directories
          console.warn(`[Git Utils] Error reading subdirectory ${entryRelativePath}:`,
            error instanceof Error ? error.message : String(error));
        }
      } else if (entry.isFile()) {
        // Add the file
        files.push(normalizedRelativePath);
      }
      // Skip symlinks and other special files
    }

    return files;
  } catch (error) {
    console.error(`[Git Utils] Error in readdirRecursive:`,
      error instanceof Error ? error.message : String(error));
    throw error; // Propagate the error to caller
  }
}

/**
 * Gets all non-ignored files in a Git repository
 * @param dir The directory to search in
 * @returns Object containing array of file paths and whether it's a git repo
 */
export async function getAllNonIgnoredFiles(dir: string): Promise<{ files: string[], isGitRepo: boolean }> {
  // Check if there's a valid cached result
  const cachedResult = fileCache.get(dir);
  const now = Date.now();

  if (cachedResult && (now - cachedResult.timestamp < CACHE_TTL)) {
    if (DEBUG_LOGS) console.log(`[Git Utils] Using cached file list for ${dir}, age: ${now - cachedResult.timestamp}ms`);
    return cachedResult;
  }

  if (DEBUG_LOGS) console.log(`[Git Utils] Cache miss or expired, getting fresh files for ${dir}`);
  // Clear any existing outdated cache
  fileCache.delete(dir);

  // Normalize the directory path for consistent handling
  const normalizedDir = normalizePath(dir);
  if (DEBUG_LOGS) console.log(`[Git Utils] Normalized directory path: ${normalizedDir}`);

  // If cache expired or not found, proceed with file scan
  // Add retry logic
  const MAX_RETRIES = 3;
  let retries = 0;
  let lastError: Error | null = null;

  while (retries < MAX_RETRIES) {
    try {
      // Assume it's a git repository; the command will fail if not
      let isGitRepo = true;

      if (DEBUG_LOGS) console.log(`[Git Utils] Listing all non-ignored files in git repository: ${normalizedDir} (attempt ${retries + 1})`);

      // First, check if this is indeed a git repository
      try {
        await execAsync('git rev-parse --is-inside-work-tree', { cwd: normalizedDir });
        if (DEBUG_LOGS) console.log(`[Git Utils] Confirmed directory is a git repository: ${normalizedDir}`);
      } catch (gitCheckError) {
        // Not a git repository, fall back to directory traversal
        console.warn(`[Git Utils] Not a git repository: ${normalizedDir}`);
        isGitRepo = false;
        // Use directory traversal fallback
        const fallbackFiles = await readdirRecursive(normalizedDir);
        if (DEBUG_LOGS) console.log(`[Git Utils] Found ${fallbackFiles.length} files via directory traversal`);

        // Cache the result if caching is enabled
        const result = { files: fallbackFiles, isGitRepo: false };
        if (DEBUG_LOGS) console.log(`[Git Utils] Adding directory traversal result to cache`);
        fileCache.set(normalizedDir, { ...result, timestamp: now });

        return result;
      }

      // Use git ls-files to get all tracked AND untracked files that aren't ignored by .gitignore
      // --cached: include tracked files
      // --others: include untracked files
      // --exclude-standard: respect .gitignore, .gitmodules, etc.
      const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: normalizedDir });

      // Split by newline and filter out empty entries
      const gitFiles = stdout.split('\n').filter(Boolean);
      
      // Filter out binary files based on their extensions
      const nonBinaryGitFiles = gitFiles.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return !BINARY_EXTENSIONS.has(ext);
      });

      if (DEBUG_LOGS) {
        console.log(`[Git Utils] Found ${gitFiles.length} files via git ls-files (tracked and untracked, not ignored)`);
        console.log(`[Git Utils] Filtered out ${gitFiles.length - nonBinaryGitFiles.length} binary files based on extensions`);
      }

      // Verify each file exists on disk as an additional check
      // This helps ensure deleted files don't appear in the list
      const existingFiles: string[] = []; // Keep array initialization
      const missingFiles: string[] = [];  // Track missing files for better debugging

      // Process files in batches to avoid file handle exhaustion
      const BATCH_SIZE = 100;
      for (let i = 0; i < nonBinaryGitFiles.length; i += BATCH_SIZE) {
        const batch = nonBinaryGitFiles.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (file) => {
            try {
              const filePath = path.join(normalizedDir, file);
              // Check if the file still exists in the filesystem
              await fs.access(filePath);
              // If access succeeds, the file exists
              // Normalize the path before adding to ensure consistency
              return { exists: true, path: normalizePathForComparison(file) };
            } catch (error) {
              // If access fails, the file doesn't exist (likely deleted or permission issue)
              return { exists: false, path: file };
            }
          })
        );

        // Add existing files to result and track missing files
        for (const result of batchResults) {
          if (result.exists) {
            existingFiles.push(result.path);
          } else {
            missingFiles.push(result.path);
          }
        }
      }

      if (DEBUG_LOGS) {
        if (missingFiles.length > 0) {
          console.log(`[Git Utils] Filtered out ${missingFiles.length} missing files of ${nonBinaryGitFiles.length} non-binary files`);
          if (missingFiles.length <= 5) {
            console.log(`[Git Utils] Missing files: ${missingFiles.join(', ')}`);
          } else {
            console.log(`[Git Utils] First 5 missing files: ${missingFiles.slice(0, 5).join(', ')}...`);
          }
        }
        console.log(`[Git Utils] Normalized ${existingFiles.length} file paths for consistent comparison`);
      }

      // Use caching if enabled (uncommented but still shows logs that caching is "disabled")
      if (DEBUG_LOGS) console.log(`[Git Utils] Caching results for future use`);
      const result = { files: existingFiles, isGitRepo };
      fileCache.set(normalizedDir, { ...result, timestamp: now });

      return result;
    } catch (error: any) {
      lastError = error;
      retries++;

      if (DEBUG_LOGS) {
        console.warn(`[Git Utils] Git operation failed (attempt ${retries}/${MAX_RETRIES}):`,
          error instanceof Error ? error.message : String(error));
      }

      // If we're in a hot reload state, add a delay between retries
      if (isInHotReloadCooldown() && retries < MAX_RETRIES) {
        const delay = retries * 300; // Increasing delay for each retry
        if (DEBUG_LOGS) console.log(`[Git Utils] Waiting ${delay}ms before retry during hot reload...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // If we reach here, all retries failed
  const errorMsg = `Failed to list files using git after ${MAX_RETRIES} attempts`;
  console.error(`[Git Utils] ${errorMsg}:`, lastError);

  // Log more details about the directory and Git state for debugging
  if (DEBUG_LOGS) {
    console.error(`[Git Utils] Directory: ${normalizedDir}`);
    try {
      // Try a simpler git command to see if git works at all
      const { stdout: gitVersion } = await execAsync('git --version', { cwd: normalizedDir });
      console.error(`[Git Utils] Git version: ${gitVersion.trim()}`);
    } catch (err) {
      console.error(`[Git Utils] Git not available:`, err instanceof Error ? err.message : String(err));
    }
  }

  // Fall back to directory traversal if git commands fail
  try {
    console.log(`[Git Utils] Falling back to directory traversal after git failure`);
    const fallbackFiles = await readdirRecursive(normalizedDir);
    if (DEBUG_LOGS) console.log(`[Git Utils] Found ${fallbackFiles.length} files via directory traversal fallback`);

    // Cache the fallback result
    const result = { files: fallbackFiles, isGitRepo: false };
    fileCache.set(normalizedDir, { ...result, timestamp: now });

    return result;
  } catch (traversalError) {
    console.error(`[Git Utils] Directory traversal fallback failed too:`,
      traversalError instanceof Error ? traversalError.message : String(traversalError));

    // Final fallback to empty result if everything fails
    console.log(`[Git Utils] Returning empty file list as final fallback`);
    const fallbackResult = { files: [], isGitRepo: false };
    fileCache.set(normalizedDir, { ...fallbackResult, timestamp: now });
    return fallbackResult;
  }
}

// Function to manually invalidate the cache when needed
export async function invalidateFileCache(dir?: string): Promise<void> {
  if (dir) {
    fileCache.delete(dir);
  } else {
    fileCache.clear();
  }
}

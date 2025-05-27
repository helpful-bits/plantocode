/**
 * Git and File Utilities
 *
 * This module provides functions to work with Git repositories and file traversal.
 * It's been rewritten to use Tauri APIs instead of Node.js APIs.
 */
import { join, resolve, extname } from "@tauri-apps/api/path";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";

import { BINARY_EXTENSIONS } from "@/utils/file-binary-utils";
import { normalizePath, ensureProjectRelativePath } from "@/utils/path-utils";
import { createLogger } from "@/utils/logger";

// File cache with TTL to prevent frequent scans
const fileCache = new Map<
  string,
  { files: string[]; timestamp: number; isGitRepo: boolean }
>();
const CACHE_TTL = 30000; // 30 seconds cache lifetime
const logger = createLogger({ namespace: "GitUtils" });

// Add a global variable to track hot reload state
let lastReloadTime = Date.now();
const HOT_RELOAD_COOLDOWN = 2000; // 2 seconds cooldown after hot reload

// Function to detect if we're in a potential hot reload scenario
function isInHotReloadCooldown(): boolean {
  const now = Date.now();
  const timeSinceReload = now - lastReloadTime;
  const inCooldown = timeSinceReload < HOT_RELOAD_COOLDOWN;

  if (inCooldown) {
    logger.debug(
      `In hot reload cooldown (${timeSinceReload}ms since last reload)`
    );
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
  currentRelativeDir: string = "",
  exclusions: string[] = ["node_modules", ".git", ".next", "dist", "build"]
): Promise<string[]> {
  try {
    const currentDir = currentRelativeDir
      ? await join(rootDir, currentRelativeDir)
      : rootDir;

    // Read the directory contents using Tauri's fs
    const entries = await readDir(currentDir);
    let files: string[] = [];

    // Process each entry
    for (const entry of entries) {
      // Skip excluded directories
      if (entry.isDirectory && exclusions.includes(entry.name)) {
        logger.debug(`Skipping excluded directory: ${entry.name}`);
        continue;
      }

      // Build the relative path for this entry
      const entryRelativePath = currentRelativeDir
        ? await join(currentRelativeDir, entry.name)
        : entry.name;

      // Normalize the path for consistent use across platforms
      const normalizedRelativePath =
        await normalizePath(entryRelativePath);

      if (entry.isDirectory) {
        try {
          // Recursively scan subdirectories
          const subDirFiles = await readdirRecursive(
            rootDir,
            entryRelativePath,
            exclusions
          );
          files = files.concat(subDirFiles);
        } catch (error) {
          // Log subdirectory errors but continue with other directories
          logger.warn(
            `Error reading subdirectory ${entryRelativePath}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      } else if (entry.isFile) {
        // Add the file
        files.push(normalizedRelativePath);
      }
    }

    return files;
  } catch (error) {
    logger.error(
      `Error in readdirRecursive:`,
      error instanceof Error ? error.message : String(error)
    );
    throw error; // Propagate the error to caller
  }
}

/**
 * Executes a git command in the given directory
 */
async function execGitCommand(command: string[], cwd: string): Promise<string> {
  try {
    // Create a command for git using the Command.create static method
    const cmd = Command.create("git", command, { cwd });
    const result = await cmd.execute();

    if (result.code !== 0) {
      throw new Error(
        `Git command failed with code ${result.code}: ${result.stderr}`
      );
    }

    return result.stdout;
  } catch (error) {
    logger.error(
      `Git command failed: ${command.join(" ")}`,
      error
    );
    throw error;
  }
}

/**
 * Gets all non-ignored files in a Git repository
 * @param dir The directory to search in
 * @returns Object containing array of file paths and whether it's a git repo
 */
export async function getAllNonIgnoredFiles(
  dir: string
): Promise<{ files: string[]; isGitRepo: boolean }> {
  // Check if there's a valid cached result
  const cachedResult = fileCache.get(dir);
  const now = Date.now();

  if (cachedResult && now - cachedResult.timestamp < CACHE_TTL) {
    logger.debug(
      `Using cached file list for ${dir}, age: ${now - cachedResult.timestamp}ms`
    );
    return cachedResult;
  }

  logger.debug(
    `Cache miss or expired, getting fresh files for ${dir}`
  );
  // Clear any existing outdated cache
  fileCache.delete(dir);

  // Normalize the directory path for consistent handling
  const normalizedDir = await resolve(dir);
  logger.debug(`Normalized directory path: ${normalizedDir}`);

  // Add retry logic
  const MAX_RETRIES = 3;
  let retries = 0;
  let lastError: Error | null = null;

  while (retries < MAX_RETRIES) {
    try {
      // Assume it's a git repository; the command will fail if not
      let isGitRepo = true;

      logger.debug(
        `Listing all non-ignored files in git repository: ${normalizedDir} (attempt ${retries + 1})`
      );

      // First, check if this is indeed a git repository
      try {
        await execGitCommand(
          ["rev-parse", "--is-inside-work-tree"],
          normalizedDir
        );
        logger.debug(
          `Confirmed directory is a git repository: ${normalizedDir}`
        );
      } catch (gitError) {
        // Not a git repository, fall back to directory traversal
        logger.warn(`Not a git repository: ${normalizedDir}, error: ${gitError instanceof Error ? gitError.message : String(gitError)}`);
        isGitRepo = false;
        // Use directory traversal fallback
        const fallbackFiles = await readdirRecursive(normalizedDir);
        logger.debug(
          `Found ${fallbackFiles.length} files via directory traversal`
        );

        // Cache the result if caching is enabled
        const result = { files: fallbackFiles, isGitRepo: false };
        logger.debug(`Adding directory traversal result to cache`);
        fileCache.set(normalizedDir, { ...result, timestamp: now });

        return result;
      }

      // Use git ls-files to get all tracked AND untracked files that aren't ignored by .gitignore
      const gitLsFilesOutput = await execGitCommand(
        ["ls-files", "--cached", "--others", "--exclude-standard"],
        normalizedDir
      );

      // Split by newline and filter out empty entries
      const gitFiles = gitLsFilesOutput.split("\n").filter(Boolean);

      // Filter out binary files based on their extensions
      const nonBinaryGitFiles = await Promise.all(
        gitFiles.map(async (file) => {
          const ext = await extname(file);
          const extLower = ext.toLowerCase();
          return {
            file,
            isBinary: BINARY_EXTENSIONS.has(extLower),
          };
        })
      );

      const filteredFiles = nonBinaryGitFiles
        .filter((item) => !item.isBinary)
        .map((item) => item.file);

      logger.debug(
        `Found ${gitFiles.length} files via git ls-files (tracked and untracked, not ignored)`
      );
      logger.debug(
        `Filtered out ${gitFiles.length - filteredFiles.length} binary files based on extensions`
      );

      // Verify each file exists on disk as an additional check
      const existingFiles: string[] = [];
      const missingFiles: string[] = [];

      // Process files in batches to avoid file handle exhaustion
      const BATCH_SIZE = 100;
      for (let i = 0; i < filteredFiles.length; i += BATCH_SIZE) {
        const batch = filteredFiles.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (file) => {
            try {
              const filePath = await join(normalizedDir, file);
              // Check if the file still exists
              const fileExists = await exists(filePath);
              // Normalize the path before adding to ensure consistency
              const normalizedPath = ensureProjectRelativePath(file);
              return { exists: fileExists, path: normalizedPath };
            } catch (_error) {
              // If error occurs, consider file missing
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

      if (missingFiles.length > 0) {
        logger.debug(
          `Filtered out ${missingFiles.length} missing files of ${filteredFiles.length} non-binary files`
        );
        if (missingFiles.length <= 5) {
          logger.debug(
            `Missing files: ${missingFiles.join(", ")}`
          );
        } else {
          logger.debug(
            `First 5 missing files: ${missingFiles.slice(0, 5).join(", ")}...`
          );
        }
      }
      logger.debug(
        `Normalized ${existingFiles.length} file paths for consistent comparison`
      );

      // Cache the results
      logger.debug(`Caching results for future use`);
      const result = { files: existingFiles, isGitRepo };
      fileCache.set(normalizedDir, { ...result, timestamp: now });

      return result;
    } catch (error) {
      lastError = error as Error;
      retries++;

      logger.warn(
        `Git operation failed (attempt ${retries}/${MAX_RETRIES}):`,
        error instanceof Error ? error.message : String(error)
      );

      // If we're in a hot reload state, add a delay between retries
      if (isInHotReloadCooldown() && retries < MAX_RETRIES) {
        const delay = retries * 300; // Increasing delay for each retry
        logger.debug(
          `Waiting ${delay}ms before retry during hot reload...`
        );
        await new Promise((timeoutResolve) => setTimeout(timeoutResolve, delay));
      }
    }
  }

  // If we reach here, all retries failed
  const errorMsg = `Failed to list files using git after ${MAX_RETRIES} attempts`;
  logger.error(`${errorMsg}:`, lastError);

  // Log more details about the directory and Git state for debugging
  logger.error(`Directory: ${normalizedDir}`);
  try {
    // Try a simpler git command to see if git works at all
    const gitVersion = await execGitCommand(["--version"], normalizedDir);
    logger.error(`Git version: ${gitVersion.trim()}`);
  } catch (err) {
    logger.error(
      `Git not available:`,
      err instanceof Error ? err.message : String(err)
    );
  }

  // Fall back to directory traversal if git commands fail
  try {
    logger.info(
      `Falling back to directory traversal after git failure`
    );
    const fallbackFiles = await readdirRecursive(normalizedDir);
    logger.debug(
      `Found ${fallbackFiles.length} files via directory traversal fallback`
    );

    // Cache the fallback result
    const result = { files: fallbackFiles, isGitRepo: false };
    fileCache.set(normalizedDir, { ...result, timestamp: now });

    return result;
  } catch (traversalError) {
    logger.error(
      `Directory traversal fallback failed too:`,
      traversalError instanceof Error
        ? traversalError.message
        : String(traversalError)
    );

    // Final fallback to empty result if everything fails
    logger.info(`Returning empty file list as final fallback`);
    const fallbackResult = { files: [], isGitRepo: false };
    fileCache.set(normalizedDir, { ...fallbackResult, timestamp: now });
    return fallbackResult;
  }
}

// Function to manually invalidate the cache when needed
export function invalidateFileCache(dir?: string): void {
  if (dir) {
    fileCache.delete(dir);
  } else {
    fileCache.clear();
  }
}

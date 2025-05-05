"use server";

import { exec } from "child_process";
import { promises as fs } from "fs";
import path from "path";

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
 * Gets all non-ignored files in a Git repository
 * @param dir The directory to search in
 * @returns Object containing array of file paths and whether it's a git repo
 */
export async function getAllNonIgnoredFiles(dir: string): Promise<{ files: string[], isGitRepo: boolean }> {
  // Cache disabled - always get fresh files
if (DEBUG_LOGS) console.log(`[Git Utils] Cache disabled, always getting fresh files for ${dir}`);
// Clear any existing cache
fileCache.delete(dir);
const now = Date.now();
  
  // If cache expired or not found, proceed with file scan
  // Add retry logic
  const MAX_RETRIES = 3;
  let retries = 0;
  let lastError: Error | null = null;
  
  while (retries < MAX_RETRIES) {
    try {
      // Assume it's a git repository; the command will fail if not
      const isGitRepo = true;
      if (DEBUG_LOGS) console.log(`Listing all non-ignored files in git repository: ${dir} (attempt ${retries + 1})`);
      
      // Use git ls-files to get all tracked AND untracked files that aren't ignored by .gitignore
      // --cached: include tracked files
      // --others: include untracked files
      // --exclude-standard: respect .gitignore, .gitmodules, etc.
      const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir });
      
      // Split by newline and filter out empty entries
      const gitFiles = stdout.split('\n').filter(Boolean);
      
      if (DEBUG_LOGS) console.log(`Found ${gitFiles.length} files via git ls-files (tracked and untracked, not ignored)`);
      
      // Verify each file exists on disk as an additional check
      // This helps ensure deleted files don't appear in the list
      const existingFiles: string[] = []; // Keep array initialization
      for (const file of gitFiles) {
        try {
          const filePath = path.join(dir, file);
          // Check if the file still exists in the filesystem
          await fs.access(filePath);
          // If access succeeds, the file exists
          existingFiles.push(file);
        } catch (error) {
          // If access fails, the file doesn't exist (likely deleted or permission issue)
          if (DEBUG_LOGS) console.log(`[Refresh] Skipping deleted file: ${file}`);
        }
      }
      
      if (DEBUG_LOGS && existingFiles.length !== gitFiles.length) {
        console.log(`[Refresh] Filtered out ${gitFiles.length - existingFiles.length} deleted files`);
      }
      
      // Cache disabled - not storing result
      if (DEBUG_LOGS) console.log(`[Git Utils] Not caching results - cache disabled`);
      
      return { files: existingFiles, isGitRepo };
    } catch (error: any) {
      lastError = error;
      retries++;
      
      if (DEBUG_LOGS) {
        console.warn(`[Git Utils] Git operation failed (attempt ${retries}/${MAX_RETRIES}):`, error.message);
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
  
  // Cache completely disabled
  if (DEBUG_LOGS) console.log(`[Git Utils] Not using expired cache, cache is disabled`);
  
  throw new Error(`Failed to list files using both git and filesystem'}`);
}

// Function to manually invalidate the cache when needed
export async function invalidateFileCache(dir?: string): Promise<void> {
  if (dir) {
    fileCache.delete(dir);
  } else {
    fileCache.clear();
  }
}

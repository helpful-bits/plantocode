"use server";

import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
const execAsync = promisify(exec);

// File cache with TTL to prevent frequent scans
const fileCache = new Map<string, { files: string[], timestamp: number, isGitRepo: boolean }>();
const CACHE_TTL = 30000; // 30 seconds cache lifetime
const DEBUG_LOGS = false; // Set to true only during development/debugging

/**
 * Gets all non-ignored files in a Git repository
 * @param dir The directory to search in
 * @returns Object containing array of file paths and whether it's a git repo
 */
export async function getAllNonIgnoredFiles(dir: string): Promise<{ files: string[], isGitRepo: boolean }> {
  // Check cache first
  const cacheKey = dir;
  const cachedResult = fileCache.get(cacheKey);
  const now = Date.now();
  
  // Return from cache if valid
  if (cachedResult && (now - cachedResult.timestamp < CACHE_TTL)) {
    if (DEBUG_LOGS) console.log(`[Git Utils] Using cached file list for ${dir} (${cachedResult.files.length} files)`);
    return { files: [...cachedResult.files], isGitRepo: cachedResult.isGitRepo };
  }
  
  // If cache expired or not found, proceed with file scan
  try {
    // Assume it's a git repository; the command will fail if not
    const isGitRepo = true;
    if (DEBUG_LOGS) console.log(`Listing all non-ignored files in git repository: ${dir}`);
    
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
    
    // Store result in cache
    fileCache.set(cacheKey, {
      files: existingFiles,
      timestamp: now,
      isGitRepo
    });
    
    return { files: existingFiles, isGitRepo };
  } catch (error: any) {
    // Handle cases where git commands fail - do not throw error, fallback to fs based listing
    console.error(`Error getting files from git repository ${dir}:`, error.message || error);
/*    
    if (error.stderr && error.stderr.toLowerCase().includes('not a git repository')) {
      throw new Error(`Directory is not a git repository: ${dir}. Please select a valid git repository.`);
    } else if (error.code === 'ENOENT' || error.message?.includes('command not found')) {
      throw new Error(`Git command not found. Please ensure git is installed on your system.`);
    }
    
    throw new Error(`Failed to list files using git: ${error.message || 'Unknown error'}`);
*/
    // Fallback to reading directory contents recursively if git fails
    console.log(`[Git Utils] Git failed, falling back to recursive directory read for ${dir}`);
    try {
        const files = await readDirectoryRecursive(dir);
        // Cache the result even if it's from the fallback
        fileCache.set(cacheKey, { files, timestamp: now, isGitRepo: false });
        return { files, isGitRepo: false };
    } catch (fsError: any) {
        console.error(`Error reading directory recursively ${dir}:`, fsError.message || fsError);
        // Throw a specific error if the fallback also fails
        throw new Error(`Failed to list files using both git and filesystem: ${fsError.message || 'Unknown error'}`);
    }
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

"use server";

import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path"; // Keep path import
// Keep imports
const execAsync = promisify(exec);

/**
 * Gets all non-ignored files in a Git repository
 * @param dir The directory to search in
 * @returns Object containing array of file paths and whether it's a git repo
 */
export async function getAllNonIgnoredFiles(dir: string): Promise<{ files: string[], isGitRepo: boolean }> {
  try {
    // Assume it's a git repository; the command will fail if not
    const isGitRepo = true;
    console.log(`Listing all non-ignored files in git repository: ${dir}`);
    
    // Use git ls-files to get all tracked AND untracked files that aren't ignored by .gitignore
    // --cached: include tracked files
    // --others: include untracked files
    // --exclude-standard: respect .gitignore, .gitmodules, etc.
    const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir });
    
    // Split by newline and filter out empty entries
    const gitFiles = stdout.split('\n').filter(Boolean);
    
    console.log(`Found ${gitFiles.length} files via git ls-files (tracked and untracked, not ignored)`);
    
    // Verify each file exists on disk as an additional check
    // This helps ensure deleted files don't appear in the list
    const existingFiles: string[] = [];
    for (const file of gitFiles) {
      try {
        const filePath = path.join(dir, file);
        // Check if the file still exists in the filesystem
        await fs.access(filePath);
        // If access succeeds, the file exists
        existingFiles.push(file);
      } catch (error) {
        // If access fails, the file doesn't exist (likely deleted or permission issue)
        console.log(`[Refresh] Skipping deleted file: ${file}`);
      }
    }
    
    if (existingFiles.length !== gitFiles.length) {
      console.log(`[Refresh] Filtered out ${gitFiles.length - existingFiles.length} deleted files`);
    }
    
    return { files: existingFiles, isGitRepo };
  } catch (error: any) {
    // Handle cases where git commands fail
    console.error(`Error getting files from git repository ${dir}:`, error.message || error);
    
    if (error.stderr && error.stderr.toLowerCase().includes('not a git repository')) {
      throw new Error(`Directory is not a git repository: ${dir}. Please select a valid git repository.`);
    } else if (error.code === 'ENOENT' || error.message?.includes('command not found')) {
      throw new Error(`Git command not found. Please ensure git is installed on your system.`);
    }
    
    throw new Error(`Failed to list files using git: ${error.message || 'Unknown error'}`);
  }
}

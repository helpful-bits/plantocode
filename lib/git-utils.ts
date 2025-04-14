"use server";

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Gets all non-ignored files in a Git repository
 * @param dir The directory to search in
 * @returns Object containing array of file paths and whether it's a git repo
 */
export async function getAllNonIgnoredFiles(dir: string): Promise<{ files: string[], isGitRepo: boolean }> {
  try {
    // Since we know it's a git repository, we can skip the check and go straight to listing files
    const isGitRepo = true;
    console.log(`Listing all non-ignored files in git repository: ${dir}`);
    
    // Use git ls-files to get all tracked AND untracked files that aren't ignored by .gitignore
    // --cached: include tracked files
    // --others: include untracked files
    // --exclude-standard: respect .gitignore, .gitmodules, etc.
    const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir });
    
    // Split by newline and filter out empty entries
    const files = stdout.split('\n').filter(Boolean);
    
    console.log(`Found ${files.length} files via git ls-files (tracked and untracked, not ignored)`);
    return { files, isGitRepo };
  } catch (error: any) {
    // Handle cases where git commands fail
    console.error(`Error getting files from git repository ${dir}:`, error.message || error);
    
    if (error.stderr && error.stderr.toLowerCase().includes('not a git repository')) {
      throw new Error(`Directory is not a git repository: ${dir}. Please select a valid git repository.`);
    } else if (error.code === 'ENOENT') {
      throw new Error(`Git command not found. Please ensure git is installed on your system.`);
    }
    
    throw new Error(`Failed to list files using git: ${error.message || 'Unknown error'}`);
  }
} 
"use server";

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Gets all non-ignored files in a Git repository
 * @param dir The directory to search in
 * @returns Array of file paths relative to the directory
 */
export async function getAllNonIgnoredFiles(dir: string): Promise<string[]> {
  try {
    // Check if it's a git directory first.
    // Explicitly set shell path to avoid ENOENT errors in restricted environments.
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: dir, shell: '/bin/sh' });

    // List all tracked and untracked (but not ignored) files.
    // Explicitly set shell path.
    const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir, shell: '/bin/sh' });
    return stdout.split('\n').filter(Boolean);
  } catch (error: any) {
    // If it's not a git repo, the error often includes "not a git repository"
    if (error.stderr && error.stderr.toLowerCase().includes('not a git repository')) {
      console.warn(`Directory is not a git repository: ${dir}`);
      return []; // Return empty array, don't throw an error
    }
    // Handle cases where it's not a git repo or git commands fail
    console.error(`Error getting non-ignored files in ${dir}:`, error.message || error);
    return [];
  }
} 
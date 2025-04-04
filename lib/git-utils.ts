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
    // Check if it's a git directory first
    await execAsync('git rev-parse --is-inside-work-tree', { cwd: dir });

    const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir });
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    // Handle cases where it's not a git repo or git commands fail
    console.error('Error getting non-ignored files:', error);
    return [];
  }
} 
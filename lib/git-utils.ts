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
    const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir });
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error getting non-ignored files:', error);
    return [];
  }
} 
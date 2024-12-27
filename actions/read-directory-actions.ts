"use server";

import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function getAllNonIgnoredFiles(dir: string): Promise<string[]> {
  try {
    // Use git ls-files --cached --others --exclude-standard to get all non-ignored files
    // This includes both tracked and untracked files that aren't ignored
    const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir });
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error getting non-ignored files:', error);
    return [];
  }
}

export async function readDirectoryAction(projectDirectory: string) {
  try {
    const finalDirectory = projectDirectory?.trim() || process.env.PROJECT_DIRECTORY;

    if (!finalDirectory) {
      throw new Error("No project directory provided");
    }

    // Get list of all non-ignored files
    const files = await getAllNonIgnoredFiles(finalDirectory);
    
    if (files.length === 0) {
      throw new Error("No files found. Is this a git repository?");
    }

    const fileContents: { [key: string]: string } = {};

    // Read all non-ignored files
    for (const file of files) {
      try {
        const fullPath = path.join(finalDirectory, file);
        const content = await fs.readFile(fullPath, 'utf-8');
        fileContents[file] = content;
      } catch (error) {
        console.warn(`Failed to read file ${file}:`, error);
      }
    }

    return { 
      isSuccess: true as const, 
      data: fileContents 
    };
  } catch (error) {
    return { 
      isSuccess: false as const, 
      message: error instanceof Error ? error.message : "Failed to read directory" 
    };
  }
} 
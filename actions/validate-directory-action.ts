'use server';

import fs from 'fs/promises';
import path from 'path';
import { ActionState } from '@/types/action-types';
import { existsSync } from 'fs';

/**
 * Validates if a directory exists and is accessible
 * @param directoryPath Path to the directory to validate
 * @returns An ActionState with isSuccess true if the directory exists and is accessible
 */
export async function validateDirectoryAction(directoryPath: string): Promise<ActionState<{ exists: boolean, isAccessible: boolean, stats?: any }>> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
      data: { exists: false, isAccessible: false }
    };
  }

  try {
    // Resolve the path to handle relative paths correctly
    const resolvedPath = path.resolve(directoryPath);
    
    // Check if path exists immediately (sync check first for better error handling)
    if (!existsSync(resolvedPath)) {
      return {
        isSuccess: false,
        message: "Directory does not exist",
        data: { exists: false, isAccessible: false }
      };
    }

    // Check if it's actually a directory
    const stats = await fs.stat(resolvedPath);
    
    if (!stats.isDirectory()) {
      return {
        isSuccess: false,
        message: "Path exists but is not a directory",
        data: { exists: true, isAccessible: false }
      };
    }

    // Try to read directory contents to check if it's accessible
    const files = await fs.readdir(resolvedPath);

    // Helpful message if directory is empty
    if (files.length === 0) {
      return {
        isSuccess: true,
        message: "Directory exists but is empty. Files may not be loaded correctly.",
        data: { 
          exists: true, 
          isAccessible: true,
          stats: {
            lastModified: stats.mtime,
            created: stats.birthtime,
            isGitRepository: false,
            isEmpty: true
          }
        }
      };
    }

    // Check if it's a git repository (presence of .git folder is a basic check)
    let isGitRepo = false;
    try {
      const gitStats = await fs.stat(path.join(resolvedPath, '.git'));
      isGitRepo = gitStats.isDirectory();
    } catch (e) {
      // Not a git repo or .git is not accessible, which is fine
    }

    // Basic stats - last modified and created dates
    const directoryStats = {
      lastModified: stats.mtime,
      created: stats.birthtime,
      isGitRepository: isGitRepo,
      isEmpty: false,
      fileCount: files.length
    };

    return {
      isSuccess: true,
      message: isGitRepo 
        ? "Directory is a valid git repository" 
        : "Directory exists and is accessible",
      data: { 
        exists: true, 
        isAccessible: true,
        stats: directoryStats
      }
    };
  } catch (error) {
    console.error("Error validating directory:", error);
    
    // Determine if it's a "not found" error or "permission denied" error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isNotFound = errorMessage.includes('ENOENT');
    const isPermissionDenied = errorMessage.includes('EACCES') || errorMessage.includes('permission denied');
    
    return {
      isSuccess: false,
      message: isNotFound 
        ? "Directory does not exist" 
        : (isPermissionDenied 
            ? "Directory exists but cannot be accessed due to permissions" 
            : `Failed to access directory: ${errorMessage}`),
      data: { 
        exists: !isNotFound, 
        isAccessible: false 
      }
    };
  }
} 
'use server';

import fs from 'fs/promises';
import path from 'path';
import { ActionState } from '@core/types';
import { existsSync } from 'fs'; // Keep existsSync import

/**
 * Validates a directory path to ensure it exists, is accessible, and optionally check if it's a git repository
 */
export async function validateDirectoryAction(directoryPath: string, validateGitRepo: boolean = true): Promise<ActionState<string | null>> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
      data: null
    };
  }
  
  try {
    console.log(`[Validate] Validating directory: ${directoryPath} (Git required: ${validateGitRepo})`);
    const resolvedPath = path.resolve(directoryPath);
    console.log(`[Validate] Resolved path: ${resolvedPath}`);
 
    // Check if path exists
    if (!existsSync(resolvedPath)) {
      return {
        isSuccess: false,
        message: "Directory does not exist",
        data: null
      };
    }
    
    // Check if it's a directory
    const stats = await fs.stat(resolvedPath);
    
    if (!stats.isDirectory()) {
      return {
        isSuccess: false,
        message: "Path exists but is not a directory",
        data: null
      };
    }

    // Check directory contents and access
    try {
      const files = await fs.readdir(resolvedPath);
      
      // Check for .git directory to identify a Git repository
      let isGitRepo = false;
      try {
        await fs.access(path.join(resolvedPath, '.git'));
        isGitRepo = true; // Assume it's a repo if .git exists and is accessible
      } catch (gitError) {
        // Not a git repository, which is fine if not required
      }

      if (files.length === 0) {
        const emptyDirResult = {
          isSuccess: validateGitRepo ? false : true, // Only success if Git is not required
          message: validateGitRepo
            ? "Directory is empty. Please select a valid git repository."
            : "Directory is empty",
          data: validateGitRepo ? null : resolvedPath
        };
        
        return emptyDirResult;
      } // End if block

      // Count regular files and directories
      let fileCount = 0;
      let dirCount = 0;
      
      // Only count top-level items to avoid slow performance on large directories
      for (const file of files) {
        try {
          const filePath = path.join(resolvedPath, file);
          const fileStat = await fs.stat(filePath);
          if (fileStat.isFile()) fileCount++;
          if (fileStat.isDirectory()) dirCount++;
        } catch (err) {
          // Skip files we can't access
        }
      }

      const directoryStats = {
        isGitRepository: isGitRepo,
        lastModified: stats.mtime,
        created: stats.birthtime,
        isEmpty: false,
        fileCount,
        dirCount
      };

      // If we require it to be a Git repo, fail if it isn't
      if (validateGitRepo && !isGitRepo) {
         return {
           isSuccess: false,
           message: "Directory is not a git repository. Please select a valid git repository.",
           data: null
         };
      }

      let successMessage = isGitRepo
        ? "Git repository detected" 
        : `Directory contains ${fileCount} files and ${dirCount} folders`;

      return {
        isSuccess: true,
        message: successMessage,
        data: resolvedPath,
      };
    } catch (readError) {
      // Handle case where directory exists but cannot be read (permissions)
      return {
        isSuccess: false,
        message: "Directory exists but cannot be read. Please check permissions.",
        data: null
      };
    }
  } catch (error: unknown) {
    console.error(`Error validating directory ${directoryPath}:`, error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isNotFound = errorMessage.includes('ENOENT');
    const isPermissionDenied = errorMessage.includes('EACCES') || errorMessage.includes('permission denied');
    
    return {
      isSuccess: false,
      message: isNotFound
        ? "Directory does not exist"
        : (isPermissionDenied
            ? "Directory exists but cannot be accessed due to insufficient permissions"
            : `Failed to access directory: ${errorMessage}`),
      data: null
    };
  }
} 
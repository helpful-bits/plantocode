'use server';

import fs from 'fs/promises';
import path from 'path'; // Keep path import
import { ActionState } from '@/types';
import { existsSync } from 'fs';

export async function validateDirectoryAction(directoryPath: string, validateGitRepo: boolean = true): Promise<ActionState<{
  exists: boolean;
  isAccessible: boolean;
  stats?: any;
}>> { // Keep function signature
  if (!directoryPath?.trim()) { // Handle empty input
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
      data: { exists: false, isAccessible: false }
    };
  }
  try { // Start try block
    console.log(`[Validate] Validating directory: ${directoryPath} (Git required: ${validateGitRepo})`);
    const resolvedPath = path.resolve(directoryPath);

    // Check if path exists
    if (!existsSync(resolvedPath)) {
      return {
        isSuccess: false,
        message: "Directory does not exist",
        data: { exists: false, isAccessible: false }
      };
    }
    
    // Check if it's a directory
    const stats = await fs.stat(resolvedPath);
    
    if (!stats.isDirectory()) { // Check if it's a directory
      return {
        isSuccess: false,
        message: "Path exists but is not a directory",
        data: { exists: true, isAccessible: false }
      };
    }

    // Check directory contents and access
    try {
      const files = await fs.readdir(resolvedPath);
      
      // Check for .git directory to identify a Git repository
      let isGitRepo = false;
      try { // Use fs.access for existence check
        await fs.access(path.join(resolvedPath, '.git'));
        // Optional: Further check if it's a directory
        // const gitStats = await fs.stat(path.join(resolvedPath, '.git'));
        isGitRepo = true; // Assume it's a repo if .git exists and is accessible
      } catch (gitError) { // Catch error if .git doesn't exist or isn't accessible
        // Not a git repository, which is fine
      }

      if (files.length === 0) {
        return {
          isSuccess: true,
          message: "Directory is empty",
          data: {
            exists: true, 
            isAccessible: true,
            stats: {
              lastModified: stats.mtime,
              created: stats.birthtime,
              isGitRepository: isGitRepo,
              isEmpty: true
            }
          }
        };
      }

      // Count regular files
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
        isGitRepository: isGitRepo, // Renamed for clarity
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
           data: { exists: true, isAccessible: true, stats: directoryStats }
         };
      }

      let successMessage = isGitRepo
        ? "Git repository detected" 
        : `Directory contains ${fileCount} files and ${dirCount} folders`;

      return { // Return success
        isSuccess: true,
        message: successMessage,
        data: {
          exists: true, 
          isAccessible: true,
          stats: directoryStats,
        }
      };
    } catch (readError) {
      // Handle case where directory exists but cannot be read (permissions)
      return {
        isSuccess: false,
        message: "Directory exists but cannot be read. Please check permissions.",
        data: { exists: true, isAccessible: false }
      };
    }
  } catch (error: unknown) {
    console.error("Error validating directory:", error);

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
      data: { 
        exists: !isNotFound, 
        isAccessible: false 
      }
    };
  }
} 
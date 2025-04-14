'use server';

import fs from 'fs/promises';
import path from 'path';
import { ActionState } from '@/types';
import { existsSync } from 'fs';

export async function validateDirectoryAction(directoryPath: string): Promise<ActionState<{
  exists: boolean;
  isAccessible: boolean;
  stats?: any;
}>> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
      data: { exists: false, isAccessible: false }
    };
  }
  try {
    console.log(`[Validate] Validating directory: ${directoryPath}`);
    const resolvedPath = path.resolve(directoryPath);

    // Check if path exists
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

    // Check if directory can be read
    try {
      const files = await fs.readdir(resolvedPath);
      
      // Check for git repository
      let isGitRepo = false;
      try {
        const gitStats = await fs.stat(path.join(resolvedPath, '.git'));
        isGitRepo = gitStats.isDirectory();
      } catch (gitError) {
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
        isGitRepository: isGitRepo,
        lastModified: stats.mtime,
        created: stats.birthtime,
        isEmpty: false,
        fileCount,
        dirCount
      };

      let successMessage = isGitRepo 
        ? "Git repository detected" 
        : `Directory contains ${fileCount} files and ${dirCount} folders`;

      return {
        isSuccess: true,
        message: successMessage,
        data: {
          exists: true, 
          isAccessible: true,
          stats: directoryStats
        }
      };
    } catch (readError) {
      // Directory exists but can't be read (permission issue)
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
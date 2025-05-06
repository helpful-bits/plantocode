"use server";

import { promises as fs } from "fs";
import path from "path";
import { BINARY_EXTENSIONS } from "@/lib/file-utils";
import { ActionState } from "@/types";
import streamingRequestPool, { RequestType } from "@/lib/api/streaming-request-pool";

const DEBUG_LOGS = process.env.NODE_ENV === 'development'; // Enable logs in development

// Common directories to exclude from file listing
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '.vscode',
  '.idea'
]);

export async function readExternalFileAction(filePath: string): Promise<ActionState<{ [key: string]: string | Buffer }>> {
  try {
    if (!filePath) {
      return {
        isSuccess: false,
        message: "No file path provided"
      };
    }
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    // Use try-catch within the loop for individual file errors
    if (DEBUG_LOGS) console.log(`[Read External] Reading: ${fullPath}`);
    const ext = path.extname(fullPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      if (DEBUG_LOGS) console.log(`[Read External] Skipping binary extension: ${ext}`);
      return { isSuccess: false, message: `Skipping binary file: ${filePath}` };
    }

    const buffer = await fs.readFile(fullPath);
    
    const fileInfo: { [key: string]: string } = {};
    fileInfo[filePath] = buffer.toString('utf-8'); // Read as UTF-8

    return {
      isSuccess: true,
      data: fileInfo,
      message: `Successfully read file: ${filePath}`
    };
  } catch (error: unknown) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read file"
    };
  }
}

export async function readDirectoryAction(projectDirectory: string): Promise<ActionState<{ files: string[] }>> {
  // Direct implementation using the job system's createBackgroundJob and enqueueJob
  // would be the proper approach here, but for now to minimize changes,
  // we'll just directly execute the implementation
  try {
    // Simply run the implementation directly
    return await readDirectoryImplementation(projectDirectory);
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read directory",
      error: error instanceof Error ? error : new Error("Failed to read directory")
    };
  }
}

// Implementation function for directory reading
async function readDirectoryImplementation(projectDirectory: string): Promise<ActionState<{ files: string[] }>> {
  try {
    const finalDirectory = projectDirectory?.trim();
    
    if (DEBUG_LOGS) console.log(`[ReadDir] Starting directory read for: "${finalDirectory}"`);
    
    if (!finalDirectory) {
      return {
        isSuccess: false,
        message: "No project directory provided"
      };
    }

    // Check if directory is accessible
    try {
      await fs.access(finalDirectory);
      if (DEBUG_LOGS) console.log(`[ReadDir] Directory access check passed: ${finalDirectory}`);
    } catch (accessError) {
      return { 
        isSuccess: false, 
        message: `Directory not found or inaccessible: ${finalDirectory}` 
      };
    }
    
    // Get all files recursively
    console.log(`[ReadDir] Starting filesystem scan of ${finalDirectory}`);
    const allFiles = await readDirectoryRecursive(finalDirectory);
    console.log(`[ReadDir] Filesystem scanning complete, found ${allFiles.length} files`);
    
    if (allFiles.length === 0) {
      return {
        isSuccess: false,
        message: "No files found in directory. Please check the directory path and permissions."
      };
    }
    
    // Filter out binary files
    const nonBinaryFiles: string[] = [];
    
    for (const filePath of allFiles) {
      try {
        const fullPath = path.join(finalDirectory, filePath);
        
        // Skip files that don't exist
        try {
          await fs.access(fullPath);
        } catch {
          continue;
        }
        
        // Filter out binary files by extension
        const ext = path.extname(fullPath).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          continue;
        }
        
        // Add file to result
        nonBinaryFiles.push(filePath);
      } catch (fileError) {
        // Skip files with errors
        continue;
      }
    }
    
    const fileCount = nonBinaryFiles.length;
    
    if (fileCount === 0) {
      return {
        isSuccess: false,
        message: "No text files could be found in the directory. Files may be binary or inaccessible."
      };
    }
    
    return {
      isSuccess: true,
      message: `Successfully found ${fileCount} text files in the directory.`,
      data: { files: nonBinaryFiles }
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error
      ? error.message
      : "An unknown error occurred while reading files";
    
    return {
      isSuccess: false,
      message: errorMessage
    };
  }
}

// Helper function to read directory recursively
async function readDirectoryRecursive(directoryPath: string, basePath: string = ''): Promise<string[]> {
  try {
    // Get directory entries
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        // Skip excluded directories
        if (EXCLUDED_DIRS.has(entry.name)) {
          continue;
        }

        try {
          // Recursively scan subdirectories
          const subFiles = await readDirectoryRecursive(entryPath, relativePath);
          files.push(...subFiles);
        } catch (error) {
          // Log error and continue with other directories
          console.warn(`[ReadDir] Error scanning subdirectory: ${relativePath}`, error);
        }
      } else if (entry.isFile()) {
        // Add file to result
        files.push(relativePath);
      }
    }

    return files;
  } catch (error) {
    console.error(`[ReadDir] Error reading directory ${directoryPath}:`, error);
    
    // Try fallback approach using plain readdir
    try {
      const simpleEntries = await fs.readdir(directoryPath);
      
      const files: string[] = [];
      for (const entry of simpleEntries) {
        try {
          const entryPath = path.join(directoryPath, entry);
          const relativePath = basePath ? path.join(basePath, entry) : entry;
          
          // Check if it's a file or directory
          const stat = await fs.stat(entryPath);
          
          if (stat.isDirectory()) {
            // Skip excluded directories
            if (EXCLUDED_DIRS.has(entry)) continue;
            
            // Recurse into subdirectories
            const subFiles = await readDirectoryRecursive(entryPath, relativePath);
            files.push(...subFiles);
          } else if (stat.isFile()) {
            files.push(relativePath);
          }
        } catch {
          // Skip entries with errors
        }
      }
      
      return files;
    } catch {
      // Return empty array if both methods fail
      return [];
    }
  }
}

// Remove this function as it's no longer needed
export async function invalidateDirectoryCache(): Promise<void> {
  // No-op
}

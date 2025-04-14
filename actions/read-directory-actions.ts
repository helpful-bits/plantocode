"use server";

import { promises as fs } from "fs";
import path from "path";
import { getAllNonIgnoredFiles } from "@/lib/git-utils";
import { isBinaryFile, BINARY_EXTENSIONS } from "@/lib/file-utils";
import { ActionState } from "@/types";

export async function readExternalFileAction(filePath: string): Promise<ActionState<{ [key: string]: string }>> {
  try {
    if (!filePath) {
      return {
        isSuccess: false,
        message: "No file path provided"
      };
    }
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    
    try {
      console.log(`[Read External] Reading: ${fullPath}`);
      const ext = path.extname(fullPath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        console.log(`[Read External] Skipping binary extension: ${ext}`);
        return { isSuccess: false, message: `Skipping binary file: ${filePath}` };
      }
      
      const buffer = await fs.readFile(fullPath);
      if (await isBinaryFile(buffer)) {
        console.warn(`Skipping detected binary file: ${filePath}`);
        return { isSuccess: false, message: `Skipping binary file: ${filePath}` };
      }
      
      const fileInfo: { [key: string]: string } = {};
      fileInfo[filePath] = buffer.toString('utf-8');

      return {
        isSuccess: true,
        data: fileInfo
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Read External] Failed to read file ${filePath}: ${errMsg}`);
      return { isSuccess: false, message: `Failed to read file ${filePath}: ${errMsg}` };
    }
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read file"
    };
  }
}

export async function readDirectoryAction(projectDirectory: string): Promise<ActionState<{ [key: string]: string }>> {
  try {
    const finalDirectory = projectDirectory?.trim();
    if (!finalDirectory) {
      return {
        isSuccess: false,
        message: "No project directory provided"
      };
    }

    try {
      await fs.access(finalDirectory);
    } catch (accessError) {
      return { 
        isSuccess: false, 
        message: `Directory not found or inaccessible: ${finalDirectory}`, 
        data: {} 
      };
    }

    console.log(`Reading git repository files from ${finalDirectory}`);
    
    // Get all files not in gitignore using git ls-files
    let files: string[] = [];
    let isGitRepo = false;
    
    try {
      const result = await getAllNonIgnoredFiles(finalDirectory);
      files = result.files;
      isGitRepo = result.isGitRepo;
      console.log(`Found ${files.length} non-ignored files via git in ${finalDirectory} (Is Git Repo: ${isGitRepo})`);
      
      if (files.length === 0) {
        return {
          isSuccess: false,
          message: `No files found in git repository at ${finalDirectory}. The repository may be empty or there might be an issue with git.`,
          data: {}
        };
      }
    } catch (gitError) {
      console.error(`Error using git to list files:`, gitError);
      return {
        isSuccess: false,
        message: gitError instanceof Error ? gitError.message : "Failed to list files using git",
        data: {}
      };
    }
    
    const fileContents: { [key: string]: string } = {};

    // Process files in batches to avoid memory issues with large repositories
    const BATCH_SIZE = 200;
    let processedCount = 0;
    let binaryCount = 0;
    let errorCount = 0;

    console.log(`Processing ${files.length} files in batches of ${BATCH_SIZE}`);
    
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      
      for (const file of batch) {
        const fullPath = path.join(finalDirectory, file);
        
        // Skip binary files and known non-text extensions
        const ext = path.extname(file).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          binaryCount++;
          continue;
        }
        
        try {
          // Check if file exists
          try {
            await fs.access(fullPath);
          } catch (error) {
            console.warn(`File not found: ${fullPath}`);
            errorCount++;
            continue;
          }
          
          const buffer = await fs.readFile(fullPath);
          
          // Skip binary files based on content analysis
          if (await isBinaryFile(buffer)) {
            binaryCount++;
            continue;
          }
          
          // Store relative path as key
          fileContents[file] = buffer.toString('utf-8');
          processedCount++;
        } catch (error: unknown) {
          errorCount++;
          const err = error as NodeJS.ErrnoException;
          if (err.code === 'ENOENT') {
            console.warn(`File not found (might be deleted or renamed): ${file}`);
          } else if (err.code === 'EACCES') {
            console.warn(`Permission denied when trying to read: ${file}`);
          } else {
            console.warn(`Failed to read file ${file}:`, err.message || err);
          }
        }
      }
    }    
    
    const fileCount = Object.keys(fileContents).length;
    if (fileCount === 0) {
      return {
        isSuccess: false,
        message: "No text files could be read from the repository. Files may be binary or inaccessible.",
        data: {}
      };
    }
    
    return {
      isSuccess: true,
      message: `Successfully read ${fileCount} text files (skipped ${binaryCount} binary files and ${errorCount} inaccessible files)`,
      data: fileContents
    };
  } catch (error: unknown) {
    console.error("Unexpected error reading directory:", error);
    return {
      isSuccess: false,
      message: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`,
      data: {}
    };
  }
}

// Helper function to read directory recursively
async function readDirectoryRecursive(directoryPath: string, basePath: string = ''): Promise<string[]> {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const files: string[] = [];
    
    for (const entry of entries) {
      // Skip hidden files and directories except .git (handled separately)
      if (entry.name.startsWith('.') && entry.name !== '.git') {
        continue;
      }
      
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;
      
      if (entry.isDirectory()) {
        // Skip node_modules and common build directories
        if (
          entry.name === 'node_modules' || 
          entry.name === 'dist' || 
          entry.name === 'build' ||
          entry.name === '.git'
        ) {
          continue;
        }
        
        try {
          const subFiles = await readDirectoryRecursive(entryPath, relativePath);
          files.push(...subFiles);
        } catch (error) {
          console.warn(`Skipping inaccessible directory: ${relativePath}`, error);
        }
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
    
    return files;
  } catch (error) {
    console.error(`Error reading directory ${directoryPath}:`, error);
    return [];
  }
} 
"use server";

import { promises as fs } from "fs";
import path from "path";
import { getAllNonIgnoredFiles } from "@/lib/git-utils";
import { isBinaryFile, BINARY_EXTENSIONS } from "@/lib/file-utils";
import { ActionState } from "@/types";

/**
 * Reads a single file from any location in the file system
 * Supports absolute and relative paths
 */
export async function readExternalFileAction(filePath: string): Promise<ActionState<{ [key: string]: string }>> {
  try {
    if (!filePath) {
      return {
        isSuccess: false,
        message: "No file path provided"
      };
    }

    // Use the provided file path as the key consistently
    const resolvedPath = path.resolve(filePath); // Store resolved path for file access
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    
    try {
      // Skip binary files
      const ext = path.extname(fullPath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        console.warn(`Skipping potential binary file based on extension: ${filePath}`);
        return { isSuccess: false, message: `Skipping binary file: ${filePath}` };
      }
      
      const buffer = await fs.readFile(fullPath);
      if (await isBinaryFile(buffer)) {
        console.warn(`Skipping detected binary file: ${filePath}`);
        return { isSuccess: false, message: `Skipping binary file: ${filePath}` };
      }
      
      // Use the original path as key for consistency with user input
      const fileInfo: { [key: string]: string } = {};
      fileInfo[filePath] = buffer.toString('utf-8'); // Always use the original path the user provided
      
      console.log(`Read external file: ${filePath}`); // Add log for debugging
      
      return {
        isSuccess: true,
        data: fileInfo
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to read file ${filePath}: ${errMsg}`);
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
  const finalDirectory = projectDirectory?.trim() || process.env.PROJECT_DIRECTORY;
  try {

    if (!finalDirectory) {
      return {
        isSuccess: false,
        message: "No project directory provided"
      };
    }

    // Validate existence and access
    try {
      await fs.access(finalDirectory);
    } catch (accessError) {
      return { isSuccess: false, message: `Directory not found or inaccessible: ${finalDirectory}` };
    }

    const files = await getAllNonIgnoredFiles(finalDirectory);
    
    if (files.length === 0) {
      return {
        isSuccess: false,
        message: "No files found. Is this a git repository?"
      };
    }
    console.log(`Found ${files.length} files in ${finalDirectory}`);

    const fileContents: { [key: string]: string } = {};
    
    for (const file of files) {
      const fullPath = path.join(finalDirectory, file);
      
      // Skip binary files
      const ext = path.extname(file).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;
      
      try {
        await fs.access(fullPath);
        
        const buffer = await fs.readFile(fullPath);
        if (await isBinaryFile(buffer)) continue;
        
        fileContents[file] = buffer.toString('utf-8');
      } catch (error) {
        // Check if the error is due to the file not existing (e.g., deleted after ls-files)
        if (error.code === 'ENOENT') {
          console.warn(`File listed by git not found (might be deleted or renamed): ${file}`);
        } else {
          console.warn(`Failed to read file ${file}:`, error.message || error);
        }
        // Continue processing other files even if one fails
      }
    }
    
    return {
      isSuccess: true,
      message: `Successfully read ${Object.keys(fileContents).length} text files`,
      data: fileContents
    };
  } catch (error) {
    console.error(`Error reading directory ${finalDirectory}:`, error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read directory"
    };  }
} 
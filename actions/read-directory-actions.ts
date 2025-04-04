"use server";

import { promises as fs } from "fs";
import path from "path";
import { isBinaryFile, BINARY_EXTENSIONS } from "@/lib/file-utils"; // Import from utility
import { getAllNonIgnoredFiles } from "@/lib/git-utils";
import { ActionState } from "@/types";

async function isBinaryFile(buffer: Buffer): Promise<boolean> {
  if (buffer.length === 0) return false; // Empty file is not binary

  const hasNullByte = buffer.includes(0);
  if (hasNullByte) return true;

  const nonPrintable = buffer.filter(byte => (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte >= 127);
  const ratio = nonPrintable.length / buffer.length;
  
  return ratio > 0.1;
}

const BINARY_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.ico', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.7z',
  '.ttf', '.woff', '.woff2',
  '.exe', '.dll', '.so',
  '.pyc',
  '.lockb', // e.g., pnpm-lock.yaml binary representation
]);

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

    // Use the provided file path as the key, potentially resolving relative paths
    const resolvedPathKey = filePath;
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    
    try {
      await fs.access(fullPath);
      
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
      
      // Use the resolved path key (original path) as the key
      const fileInfo: { [key: string]: string } = {};
      fileInfo[resolvedPathKey] = buffer.toString('utf-8');
      
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
        console.warn(`Failed to read file ${file}:`, error);
      }
    }
    
    return {
      isSuccess: true,
      message: "Successfully read directory",
      data: fileContents
    };
  } catch (error) {
    console.error(`Error reading directory ${finalDirectory}:`, error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read directory"
    };
  }
} 
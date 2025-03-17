"use server";

import { promises as fs } from "fs";
import path from "path";
import { getAllNonIgnoredFiles } from "@/lib/git-utils";
import { ActionState } from "@/types";

async function isBinaryFile(buffer: Buffer): Promise<boolean> {
  const hasNullByte = buffer.includes(0);
  if (hasNullByte) return true;

  const nonPrintable = buffer.filter(byte => (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte >= 127);
  const ratio = nonPrintable.length / buffer.length;
  
  return ratio > 0.1;
}

const BINARY_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.ico', '.webp',
  '.mp3', '.mp4', '.wav', '.ogg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.zip', '.tar', '.gz', '.7z',
  '.ttf', '.woff', '.woff2',
  '.exe', '.dll', '.so',
  '.pyc',
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

    const fileInfo: { [key: string]: string } = {};
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    
    try {
      // Check if file exists and is accessible
      await fs.access(fullPath);
      
      // Skip binary files
      const ext = path.extname(fullPath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        return {
          isSuccess: false,
          message: `Cannot read binary file: ${filePath}`
        };
      }
      
      const buffer = await fs.readFile(fullPath);
      if (await isBinaryFile(buffer)) {
        return {
          isSuccess: false,
          message: `Cannot read binary file: ${filePath}`
        };
      }
      
      // Use original file path as the key
      fileInfo[filePath] = buffer.toString('utf-8');
      
      return {
        isSuccess: true,
        message: "Successfully read file",
        data: fileInfo
      };
    } catch (error) {
      return {
        isSuccess: false,
        message: `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      };
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
    const finalDirectory = projectDirectory?.trim() || process.env.PROJECT_DIRECTORY;

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

    const fileContents: { [key: string]: string } = {};
    
    for (const file of files) {
      const fullPath = path.join(finalDirectory, file);
      
      // Skip binary files
      const ext = path.extname(file).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;
      
      try {
        // Check if file exists and is accessible
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
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read directory"
    };
  }
} 
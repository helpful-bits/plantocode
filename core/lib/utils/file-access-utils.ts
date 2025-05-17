/**
 * File Access Utilities
 * 
 * This module provides utility functions for secure and efficient file access operations
 * including permission checks, path validation, and file operation wrappers.
 */

import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { createError, ErrorType } from './error-handling';

/**
 * Ensures a path is within a specified root directory to prevent path traversal vulnerabilities
 * @param rootDir The allowed root directory
 * @param targetPath The path to validate
 * @returns The normalized absolute path if valid
 * @throws Error if path is outside the root directory
 */
export function ensureSafePath(rootDir: string, targetPath: string): string {
  // Normalize paths to absolute paths
  const normalizedRoot = path.resolve(rootDir);
  const normalizedTarget = path.resolve(normalizedRoot, targetPath);
  
  // Check if the target path is within the root directory
  if (!normalizedTarget.startsWith(normalizedRoot)) {
    throw createError(
      `Access denied: Path "${targetPath}" is outside the allowed directory "${rootDir}"`,
      ErrorType.PERMISSION_ERROR
    );
  }
  
  return normalizedTarget;
}

/**
 * Safely reads a file ensuring it's within allowed directory
 * @param rootDir The allowed root directory
 * @param filePath Path to the file
 * @param options Node.js file read options
 * @returns File content
 */
export async function safeReadFile(
  rootDir: string,
  filePath: string,
  options?: { encoding?: BufferEncoding; flag?: string }
): Promise<string | Buffer> {
  const safePath = ensureSafePath(rootDir, filePath);
  
  try {
    return await fsPromises.readFile(safePath, options);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError(
        `File not found: "${filePath}"`,
        ErrorType.NOT_FOUND_ERROR,
        { cause: error as Error }
      );
    }
    
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw createError(
        `Permission denied: Cannot read "${filePath}"`,
        ErrorType.PERMISSION_ERROR,
        { cause: error as Error }
      );
    }
    
    throw createError(
      `Error reading file "${filePath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Safely writes a file ensuring it's within allowed directory
 * @param rootDir The allowed root directory
 * @param filePath Path to the file
 * @param data Content to write
 * @param options Node.js file write options
 */
export async function safeWriteFile(
  rootDir: string,
  filePath: string,
  data: string | Buffer,
  options?: { encoding?: BufferEncoding; flag?: string; mode?: number }
): Promise<void> {
  const safePath = ensureSafePath(rootDir, filePath);
  
  // Ensure the directory exists
  const dirPath = path.dirname(safePath);
  await fsPromises.mkdir(dirPath, { recursive: true });
  
  try {
    await fsPromises.writeFile(safePath, data, options);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw createError(
        `Permission denied: Cannot write to "${filePath}"`,
        ErrorType.PERMISSION_ERROR,
        { cause: error as Error }
      );
    }
    
    throw createError(
      `Error writing file "${filePath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Safely creates a directory ensuring it's within allowed directory
 * @param rootDir The allowed root directory
 * @param dirPath Path to create
 * @param options Node.js mkdir options
 */
export async function safeCreateDirectory(
  rootDir: string,
  dirPath: string,
  options?: { recursive?: boolean; mode?: number }
): Promise<void> {
  const safePath = ensureSafePath(rootDir, dirPath);
  
  try {
    await fsPromises.mkdir(safePath, { recursive: true, ...options });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw createError(
        `Permission denied: Cannot create directory "${dirPath}"`,
        ErrorType.PERMISSION_ERROR,
        { cause: error as Error }
      );
    }
    
    throw createError(
      `Error creating directory "${dirPath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Safely removes a file ensuring it's within allowed directory
 * @param rootDir The allowed root directory
 * @param filePath Path to the file
 */
export async function safeRemoveFile(rootDir: string, filePath: string): Promise<void> {
  const safePath = ensureSafePath(rootDir, filePath);
  
  try {
    await fsPromises.unlink(safePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist, consider the operation successful
      return;
    }
    
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw createError(
        `Permission denied: Cannot delete "${filePath}"`,
        ErrorType.PERMISSION_ERROR,
        { cause: error as Error }
      );
    }
    
    throw createError(
      `Error removing file "${filePath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Checks if a file exists within allowed directory
 * @param rootDir The allowed root directory
 * @param filePath Path to the file
 * @returns Boolean indicating if file exists
 */
export async function safeFileExists(rootDir: string, filePath: string): Promise<boolean> {
  const safePath = ensureSafePath(rootDir, filePath);
  
  try {
    const stats = await fsPromises.stat(safePath);
    return stats.isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    
    throw createError(
      `Error checking if file exists "${filePath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Checks if a directory exists within allowed directory
 * @param rootDir The allowed root directory
 * @param dirPath Path to the directory
 * @returns Boolean indicating if directory exists
 */
export async function safeDirectoryExists(rootDir: string, dirPath: string): Promise<boolean> {
  const safePath = ensureSafePath(rootDir, dirPath);
  
  try {
    const stats = await fsPromises.stat(safePath);
    return stats.isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    
    throw createError(
      `Error checking if directory exists "${dirPath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Recursively reads a directory within allowed directory
 * @param rootDir The allowed root directory
 * @param dirPath Directory to read
 * @param options Read directory options
 * @returns Array of directory entries with full paths
 */
export async function safeReadDirectory(
  rootDir: string,
  dirPath: string,
  options: { recursive?: boolean; includeFiles?: boolean; includeDirectories?: boolean } = {}
): Promise<string[]> {
  const { 
    recursive = false, 
    includeFiles = true, 
    includeDirectories = true 
  } = options;
  
  const safePath = ensureSafePath(rootDir, dirPath);
  
  try {
    const entries = await fsPromises.readdir(safePath, { withFileTypes: true });
    let results: string[] = [];
    
    for (const entry of entries) {
      const fullPath = path.join(safePath, entry.name);
      
      if (entry.isDirectory()) {
        if (includeDirectories) {
          results.push(fullPath);
        }
        
        if (recursive) {
          const subEntries = await safeReadDirectory(rootDir, fullPath, options);
          results = results.concat(subEntries);
        }
      } else if (entry.isFile() && includeFiles) {
        results.push(fullPath);
      }
    }
    
    return results;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError(
        `Directory not found: "${dirPath}"`,
        ErrorType.NOT_FOUND_ERROR,
        { cause: error as Error }
      );
    }
    
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw createError(
        `Permission denied: Cannot read directory "${dirPath}"`,
        ErrorType.PERMISSION_ERROR,
        { cause: error as Error }
      );
    }
    
    throw createError(
      `Error reading directory "${dirPath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Gets file stats within allowed directory
 * @param rootDir The allowed root directory
 * @param filePath Path to the file
 * @returns File stats
 */
export async function safeGetStats(rootDir: string, filePath: string): Promise<fs.Stats> {
  const safePath = ensureSafePath(rootDir, filePath);
  
  try {
    return await fsPromises.stat(safePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError(
        `File not found: "${filePath}"`,
        ErrorType.NOT_FOUND_ERROR,
        { cause: error as Error }
      );
    }
    
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw createError(
        `Permission denied: Cannot access "${filePath}"`,
        ErrorType.PERMISSION_ERROR,
        { cause: error as Error }
      );
    }
    
    throw createError(
      `Error getting stats for "${filePath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Copy a file within allowed directory
 * @param rootDir The allowed root directory
 * @param sourcePath Source file path
 * @param targetPath Target file path
 */
export async function safeCopyFile(
  rootDir: string,
  sourcePath: string,
  targetPath: string
): Promise<void> {
  const safeSourcePath = ensureSafePath(rootDir, sourcePath);
  const safeTargetPath = ensureSafePath(rootDir, targetPath);
  
  // Ensure target directory exists
  const targetDir = path.dirname(safeTargetPath);
  await fsPromises.mkdir(targetDir, { recursive: true });
  
  try {
    await fsPromises.copyFile(safeSourcePath, safeTargetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw createError(
        `Source file not found: "${sourcePath}"`,
        ErrorType.NOT_FOUND_ERROR,
        { cause: error as Error }
      );
    }
    
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      throw createError(
        `Permission denied: Cannot copy "${sourcePath}" to "${targetPath}"`,
        ErrorType.PERMISSION_ERROR,
        { cause: error as Error }
      );
    }
    
    throw createError(
      `Error copying file from "${sourcePath}" to "${targetPath}": ${(error as Error).message}`,
      ErrorType.INTERNAL_ERROR,
      { cause: error as Error }
    );
  }
}

/**
 * Normalizes and sanitizes a file path
 * @param filePath The path to sanitize
 * @returns Sanitized path
 */
export function sanitizePath(filePath: string): string {
  // Normalize the path (resolve .. and .)
  const normalized = path.normalize(filePath);
  
  // Remove any null bytes which can be used in some path traversal attacks
  const withoutNullBytes = normalized.replace(/\0/g, '');
  
  return withoutNullBytes;
}

/**
 * Gets a file's MIME type based on extension
 * @param filePath Path to the file
 * @returns MIME type string
 */
export function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript-react',
    '.jsx': 'text/jsx',
    '.py': 'text/x-python',
    '.rb': 'text/x-ruby',
    '.go': 'text/x-go',
    '.rs': 'text/x-rust',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
    '.hpp': 'text/x-c++',
    '.java': 'text/x-java',
    '.php': 'text/x-php',
    '.swift': 'text/x-swift',
    '.kt': 'text/x-kotlin',
    '.sql': 'text/x-sql'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}
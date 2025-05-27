/**
 * File Access Utilities
 *
 * This module provides utility functions for secure and efficient file access operations
 * using Tauri's filesystem API rather than Node.js APIs (which aren't available in the browser).
 */

import {
  dirname,
  extname,
} from "@tauri-apps/api/path";
import {
  readTextFile,
  writeTextFile,
  mkdir,
  remove,
  exists,
} from "@tauri-apps/plugin-fs";

import { createError, ErrorType } from "@/utils/error-handling";
import { normalizePath as tauriNormalizePath, pathJoin } from "@/utils/tauri-fs";

/**
 * Ensures a path is within a specified root directory to prevent path traversal vulnerabilities
 * @param rootDir The allowed root directory
 * @param targetPath The path to validate
 * @returns The normalized absolute path if valid
 * @throws Error if path is outside the root directory
 */
export async function ensureSafePath(
  rootDir: string,
  targetPath: string
): Promise<string> {
  // Normalize paths to absolute paths
  const normalizedRoot = await tauriNormalizePath(rootDir);
  const normalizedTarget = await tauriNormalizePath(await pathJoin(normalizedRoot, targetPath));

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
 * @returns File content as string
 */
export async function safeReadFile(
  rootDir: string,
  filePath: string
): Promise<string> {
  const safePath = await ensureSafePath(rootDir, filePath);

  try {
    return await readTextFile(safePath);
  } catch (error) {
    const errorMsg = (error as Error).message || "";

    if (errorMsg.includes("file not found")) {
      throw createError(
        `File not found: "${filePath}"`,
        ErrorType.NOT_FOUND_ERROR,
        { cause: error as Error }
      );
    }

    if (errorMsg.includes("permission denied")) {
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
 */
export async function safeWriteFile(
  rootDir: string,
  filePath: string,
  data: string
): Promise<void> {
  const safePath = await ensureSafePath(rootDir, filePath);

  // Ensure the directory exists
  const dirPath = await dirname(safePath);
  await mkdir(dirPath, { recursive: true });

  try {
    await writeTextFile(safePath, data);
  } catch (error) {
    const errorMsg = (error as Error).message || "";

    if (errorMsg.includes("permission denied")) {
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
 */
export async function safeCreateDirectory(
  rootDir: string,
  dirPath: string
): Promise<void> {
  const safePath = await ensureSafePath(rootDir, dirPath);

  try {
    await mkdir(safePath, { recursive: true });
  } catch (error) {
    const errorMsg = (error as Error).message || "";

    if (errorMsg.includes("permission denied")) {
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
export async function safeRemoveFile(
  rootDir: string,
  filePath: string
): Promise<void> {
  const safePath = await ensureSafePath(rootDir, filePath);

  try {
    await remove(safePath);
  } catch (error) {
    const errorMsg = (error as Error).message || "";

    if (errorMsg.includes("file not found")) {
      // File doesn't exist, consider the operation successful
      return;
    }

    if (errorMsg.includes("permission denied")) {
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
export async function safeFileExists(
  rootDir: string,
  filePath: string
): Promise<boolean> {
  const safePath = await ensureSafePath(rootDir, filePath);
  return exists(safePath);
}

/**
 * Normalizes and sanitizes a file path
 * @param filePath The path to sanitize
 * @returns Sanitized path
 */
export async function sanitizePath(filePath: string): Promise<string> {
  // Normalize the path (resolve .. and .)
  const normalized = await tauriNormalizePath(filePath);

  // Remove any null bytes which can be used in some path traversal attacks
  const withoutNullBytes = normalized.replace(/\0/g, "");

  return withoutNullBytes;
}

/**
 * Gets a file's MIME type based on extension
 * @param filePath Path to the file
 * @returns MIME type string
 */
export async function getMimeType(filePath: string): Promise<string> {
  const extension = await extname(filePath);
  const extensionLower = extension.toLowerCase();

  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".json": "application/json",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".ts": "text/typescript",
    ".tsx": "text/typescript-react",
    ".jsx": "text/jsx",
    ".py": "text/x-python",
    ".rb": "text/x-ruby",
    ".go": "text/x-go",
    ".rs": "text/x-rust",
    ".c": "text/x-c",
    ".cpp": "text/x-c++",
    ".h": "text/x-c",
    ".hpp": "text/x-c++",
    ".java": "text/x-java",
    ".php": "text/x-php",
    ".swift": "text/x-swift",
    ".kt": "text/x-kotlin",
    ".sql": "text/x-sql",
  };

  return mimeTypes[extensionLower] || "application/octet-stream";
}

"use server";

import { promises as fs } from "fs";
import path from "path";
import { existsSync } from "fs";
import os from "os";
import { ActionState } from "@/types";
import { normalizePath } from "@/lib/path-utils";

/**
 * Directory information returned by the list directories action
 */
interface DirectoryInfo {
  name: string;
  path: string;
  isAccessible: boolean;
}

/**
 * Get common paths as an async function to comply with 'use server'
 */
export async function getCommonPaths(): Promise<DirectoryInfo[]> {
  const homeDir = os.homedir();
  const documentsPath = path.join(homeDir, "Documents");
  const desktopPath = path.join(homeDir, "Desktop");
  const downloadsPath = path.join(homeDir, "Downloads");

  const COMMON_PATHS_DATA = [
    { name: "Home", path: homeDir, isAccessible: existsSync(homeDir) },
    ...(existsSync(documentsPath) ? [{ name: "Documents", path: documentsPath }] : []),
    ...(existsSync(desktopPath) ? [{ name: "Desktop", path: desktopPath }] : []),
    ...(existsSync(downloadsPath) ? [{ name: "Downloads", path: downloadsPath }] : []),
    ...(os.platform() === "win32"
      ? [{ name: "C:\\", path: "C:\\" }] // Assuming C: drive exists on Windows
      : [{ name: "/", path: "/" }]),
  ].filter(p => existsSync(p.path)).map(p => ({
    name: p.name,
    path: normalizePath(p.path) // Normalize paths for consistency
  }));

  return COMMON_PATHS_DATA;
}

/**
 * Get the user's home directory
 */
export async function getHomeDirectoryAction(): Promise<ActionState<string>> {
  try {
    const homeDir = normalizePath(os.homedir());
    return {
      isSuccess: true,
      message: "Home directory retrieved",
      data: homeDir
    };
  } catch (error) {
    console.error("Error getting home directory:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to get home directory"
    };
  }
}

/**
 * List subdirectories at a given path
 */
export async function listDirectoriesAction(directoryPath: string): Promise<ActionState<{
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryInfo[];
}>> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
      data: { currentPath: "", parentPath: null, directories: [] }
    };
  }

  try {
    console.log(`[ListDirs] Listing directories in: ${directoryPath}`);
    const resolvedPath = normalizePath(path.resolve(directoryPath));

    // Check if path exists
    if (!existsSync(resolvedPath)) {
      return {
        isSuccess: false,
        message: "Directory does not exist",
        data: { currentPath: resolvedPath, parentPath: null, directories: [] }
      };
    }

    // Check if it's a directory
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      return {
        isSuccess: false,
        message: "Path exists but is not a directory",
        data: { currentPath: resolvedPath, parentPath: null, directories: [] }
      };
    }

    // Get parent directory
    const parentPath = path.dirname(resolvedPath) !== resolvedPath 
      ? normalizePath(path.dirname(resolvedPath))
      : null;

    // Read directory contents
    let files: string[];
    try {
      files = await fs.readdir(resolvedPath);
    } catch (error) {
      return {
        isSuccess: false,
        message: "Directory exists but cannot be read. Please check permissions.",
        data: {
          currentPath: resolvedPath, 
          parentPath,
          directories: [] 
        }
      };
    }

    // Filter for directories and add metadata
    const directories: DirectoryInfo[] = [];
    
    for (const file of files) {
      const fullPath = normalizePath(path.join(resolvedPath, file));
      
      try {
        const fileStats = await fs.stat(fullPath);
        if (fileStats.isDirectory()) {
          directories.push({
            name: file,
            path: fullPath,
            isAccessible: true
          });
        }
      } catch (error) {
        // Handle permission issues for individual directories
        if (error instanceof Error && error.message.includes('permission denied')) {
          directories.push({
            name: file,
            path: fullPath,
            isAccessible: false
          });
        }
        // Skip other errors (might be symlinks, etc.)
      }
    }

    // Sort directories alphabetically
    directories.sort((a, b) => a.name.localeCompare(b.name));

    return {
      isSuccess: true,
      message: `Found ${directories.length} directories`,
      data: {
        currentPath: resolvedPath,
        parentPath,
        directories
      }
    };
  } catch (error) {
    console.error(`Error listing directories in ${directoryPath}:`, error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to list directories",
      data: { currentPath: directoryPath, parentPath: null, directories: [] }
    };
  }
}

/**
 * Validate and select a directory path
 */
export async function selectDirectoryAction(directoryPath: string): Promise<ActionState<string>> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty"
    };
  }

  try {
    console.log(`[SelectDir] Selecting directory: ${directoryPath}`);
    const resolvedPath = normalizePath(path.resolve(directoryPath));

    // Check if path exists
    if (!existsSync(resolvedPath)) {
      return {
        isSuccess: false,
        message: "Directory does not exist"
      };
    }

    // Check if it's a directory
    const stats = await fs.stat(resolvedPath);
    if (!stats.isDirectory()) {
      return {
        isSuccess: false,
        message: "Path exists but is not a directory"
      };
    }

    // Check read access
    try {
      await fs.access(resolvedPath, fs.constants.R_OK);
    } catch (error) {
      return {
        isSuccess: false,
        message: "Directory exists but cannot be read. Please check permissions."
      };
    }

    return {
      isSuccess: true,
      message: "Directory selected successfully",
      data: resolvedPath
    };
  } catch (error) {
    console.error(`Error selecting directory ${directoryPath}:`, error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to select directory"
    };
  }
} 
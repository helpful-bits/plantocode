import { type ActionState } from "@/types";

import * as tauriFs from "../../utils/tauri-fs";

/**
 * Directory information returned by the list directories action
 */
interface DirectoryInfo {
  name: string;
  path: string;
  isAccessible: boolean;
}

/**
 * Get common paths from the system
 */
export async function getCommonPaths(): Promise<DirectoryInfo[]> {
  try {
    // Use tauriFs to get common paths
    const commonPaths = await tauriFs.getCommonPaths();
    return commonPaths.map(
      (path: { name: string; path: string; is_accessible: boolean }) => ({
        name: path.name,
        path: path.path,
        isAccessible: path.is_accessible,
      })
    );
  } catch (error) {
    console.error("[getCommonPaths] Error:", error);
    // Return minimal fallback common paths if command fails
    return [
      {
        name: "Home",
        path: await tauriFs.getHomeDirectory(),
        isAccessible: true,
      },
      { name: "Root", path: "/", isAccessible: true },
    ];
  }
}

/**
 * Get the user's home directory
 */
export async function getHomeDirectoryAction(): Promise<ActionState<string>> {
  try {
    // Use tauriFs to get the home directory
    const homeDir = await tauriFs.getHomeDirectory();

    // Ensure we have a non-empty string
    if (!homeDir || homeDir.trim() === "") {
      console.error(`[HomeDir] Got empty home directory path`);
      return {
        isSuccess: false,
        message: "Home directory path is empty",
        data: "/", // Provide fallback data
      };
    }

    return {
      isSuccess: true,
      message: "Home directory retrieved",
      data: homeDir,
    };
  } catch (error) {
    console.error("Error getting home directory:", error);
    return {
      isSuccess: false,
      message:
        error instanceof Error ? error.message : "Failed to get home directory",
      data: "/", // Always provide fallback data
    };
  }
}

/**
 * List subdirectories at a given path
 */
export async function listDirectoriesAction(directoryPath: string): Promise<
  ActionState<{
    currentPath: string;
    parentPath: string | null;
    directories: DirectoryInfo[];
  }>
> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
      data: { currentPath: "", parentPath: null, directories: [] },
    };
  }

  try {

    // Normalize the path
    const resolvedPath = await tauriFs.normalizePath(directoryPath);


    // Get all files and directories
    const files = await tauriFs.listFiles(resolvedPath, undefined, true);

    // Get parent directory
    let parentPath = null;
    try {
      // Get parent using path_dirname_command
      parentPath = await tauriFs.pathDirname(resolvedPath);

      // If parent is the same as current (root case), set to null
      if (parentPath === resolvedPath) {
        parentPath = null;
      } else if (resolvedPath !== "/" && !resolvedPath.match(/^[A-Z]:\\$/i)) {
        // Special handling for Windows drive roots
        parentPath = parentPath || "/";
      }
    } catch (error) {
      console.error(
        `[ListDirs] Error getting parent path for ${resolvedPath}:`,
        error
      );
      // Continue even without parent path
    }

    // Filter for directories only
    const directories: DirectoryInfo[] = files
      .filter((file: { is_dir: boolean }) => file.is_dir)
      .map(
        (file: {
          name: string;
          path: string;
          is_readable?: boolean;
          is_dir: boolean;
        }) => ({
          name: file.name,
          path: file.path,
          isAccessible:
            file.is_readable === undefined ? true : file.is_readable,
        })
      );

    // Sort directories alphabetically
    directories.sort((a, b) => a.name.localeCompare(b.name));

    return {
      isSuccess: true,
      message: `Found ${directories.length} directories`,
      data: {
        currentPath: resolvedPath,
        parentPath,
        directories,
      },
    };
  } catch (error) {
    console.error(`Error listing directories in ${directoryPath}:`, error);

    if (error instanceof Error && error.message.includes("not found")) {
      return {
        isSuccess: false,
        message: "Directory does not exist",
        data: { currentPath: directoryPath, parentPath: null, directories: [] },
      };
    } else if (
      error instanceof Error &&
      error.message.includes("permission denied")
    ) {
      return {
        isSuccess: false,
        message:
          "Directory exists but cannot be read. Please check permissions.",
        data: { currentPath: directoryPath, parentPath: null, directories: [] },
      };
    }

    return {
      isSuccess: false,
      message:
        error instanceof Error ? error.message : "Failed to list directories",
      data: { currentPath: directoryPath, parentPath: null, directories: [] },
    };
  }
}

/**
 * Validate and select a directory path
 */
export async function selectDirectoryAction(
  directoryPath: string
): Promise<ActionState<string>> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
    };
  }

  try {

    // Normalize the path
    const resolvedPath = await tauriFs.normalizePath(directoryPath);

    // Use listFiles to verify it's a readable directory
    try {
      await tauriFs.listFiles(resolvedPath);

      return {
        isSuccess: true,
        message: "Directory selected successfully",
        data: resolvedPath,
      };
    } catch (error) {
      if (error instanceof Error) {
        // Check specific error types from the backend
        if (error.message.includes("not found")) {
          return {
            isSuccess: false,
            message: "Directory does not exist",
          };
        } else if (error.message.includes("permission denied")) {
          return {
            isSuccess: false,
            message:
              "Directory exists but cannot be read. Please check permissions.",
          };
        } else if (error.message.includes("not a directory")) {
          return {
            isSuccess: false,
            message: "Path exists but is not a directory",
          };
        }
      }

      // Unknown error
      throw error;
    }
  } catch (error) {
    console.error(`Error selecting directory ${directoryPath}:`, error);
    return {
      isSuccess: false,
      message:
        error instanceof Error ? error.message : "Failed to select directory",
    };
  }
}

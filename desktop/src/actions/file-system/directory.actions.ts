import { type ActionState } from "@/types";

import * as tauriFs from "../../utils/tauri-fs";

/**
 * Get the user's home directory
 */
export async function getHomeDirectoryAction(): Promise<ActionState<string>> {
  try {
    // Use tauriFs to get the home directory
    const homeDir = await tauriFs.getHomeDirectory();

    // Ensure we have a non-empty string
    if (!homeDir || homeDir.trim() === "") {
      console.error(`[getHomeDirectoryAction] Received empty home directory path from Tauri.`);
      return {
        isSuccess: false,
        message: "Failed to retrieve a valid home directory path.",
        data: undefined,
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
      data: undefined,
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


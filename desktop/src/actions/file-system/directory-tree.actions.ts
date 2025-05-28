import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { type DirectoryTreeOptions } from "@/types/tauri-commands";
import { handleActionError } from "@/utils/action-utils";

/**
 * Generates a directory tree directly as a utility function
 * @param directoryPath The directory path to process
 * @param options Optional DirectoryTreeOptions
 * @returns A promise resolving to an ActionState with the directory tree string
 */
export async function generateDirectoryTreeAction(
  directoryPath: string,
  options?: DirectoryTreeOptions
): Promise<ActionState<{ directoryTree: string }>> {
  try {
    if (!directoryPath || !directoryPath.trim()) {
      return {
        isSuccess: false,
        message: "No project directory provided",
      };
    }

    // Generate directory tree directly
    const directoryTree = await invoke<string>(
      "generate_directory_tree_command",
      {
        projectDirectory: directoryPath,
        options: options || null,
      }
    );

    // Return success with the directory tree
    return {
      isSuccess: true,
      message: "Directory tree generated successfully",
      data: { directoryTree },
    };
  } catch (error) {
    console.error("[generateDirectoryTreeAction] Error:", error);
    return handleActionError(error) as ActionState<{ directoryTree: string }>;
  }
}
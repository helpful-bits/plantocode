import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

import * as tauriFs from "../../utils/tauri-fs";

/**
 * Validates a directory path to ensure it exists, is accessible, and optionally check if it's a git repository.
 * This is the single source of truth for directory validation across the application.
 */
export async function validateDirectoryAction(
  directoryPath: string,
  validateGitRepo: boolean = false
): Promise<ActionState<string | null>> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
      data: undefined,
    };
  }

  try {
    const resolvedPath = await tauriFs.normalizePath(directoryPath);

    // Try git-based validation first
    try {
      // Try to list project files to validate directory and git repository
      const files = await tauriFs.listProjectFiles(resolvedPath);

      // If listProjectFiles succeeds, it means it's a valid git repository
      const isGitRepo = true;
      
      if (files.length === 0) {
        const emptyDirResult = {
          isSuccess: validateGitRepo ? false : true,
          message: validateGitRepo
            ? "Git repository is empty. Please select a git repository with files."
            : "Git repository is empty",
          data: validateGitRepo ? undefined : resolvedPath,
        };

        return emptyDirResult;
      }

      // Count files (all items are files in the new system)
      const fileCount = files.length;

      const successMessage = isGitRepo
        ? "Git repository detected"
        : `Directory contains ${fileCount} files`;

      return {
        isSuccess: true,
        message: successMessage,
        data: resolvedPath,
      };
    } catch (error) {
      // If git-based validation fails but git is not required, 
      // we can still accept the directory if it exists
      if (!validateGitRepo) {
        // For non-git validation, we assume the directory is valid
        // since the normalizePath succeeded above
        return {
          isSuccess: true,
          message: "Directory validated (not a git repository)",
          data: resolvedPath,
        };
      }

      // Process specific error types for git validation failures
      if (error instanceof Error) {
        const errorMessage = error.message;

        if (errorMessage.includes("not found")) {
          return {
            isSuccess: false,
            message: "Directory does not exist",
            data: undefined,
          };
        } else if (errorMessage.includes("not a directory")) {
          return {
            isSuccess: false,
            message: "Path exists but is not a directory",
            data: undefined,
          };
        } else if (errorMessage.includes("permission denied")) {
          return {
            isSuccess: false,
            message:
              "Directory exists but cannot be read. Please check permissions.",
            data: undefined,
          };
        }
      }

      // If git validation was required but failed, return appropriate message
      return {
        isSuccess: false,
        message: "Directory is not a git repository. Please select a valid git repository.",
        data: undefined,
      };
    }
  } catch (error: unknown) {
    console.error(`Error validating directory ${directoryPath}:`, error);
    return handleActionError(error) as ActionState<string | null>;
  }
}

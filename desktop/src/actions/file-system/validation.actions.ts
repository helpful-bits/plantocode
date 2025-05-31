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

    // First check if the directory exists by listing files
    try {
      // Get directory contents
      const files = await tauriFs.listFiles(resolvedPath, undefined, true);

      // Check for .git directory to identify a Git repository
      let isGitRepo = false;
      try {
        const gitPath = await tauriFs.pathJoin(resolvedPath, ".git");
        // Check if .git exists by trying to list it
        await tauriFs.listFiles(gitPath);
        isGitRepo = true;
      } catch (_gitError) {
        // Not a git repository, which is fine if not required
      }

      if (files.length === 0) {
        const emptyDirResult = {
          isSuccess: validateGitRepo ? false : true, // Only success if Git is not required
          message: validateGitRepo
            ? "Directory is empty. Please select a valid git repository."
            : "Directory is empty",
          data: validateGitRepo ? undefined : resolvedPath,
        };

        return emptyDirResult;
      }

      // Count files and directories
      let fileCount = 0;
      let dirCount = 0;

      // Process the listing results to count files and directories
      for (const file of files) {
        if (file.isDir) {
          dirCount++;
        } else {
          fileCount++;
        }
      }

      // If we require it to be a Git repo, fail if it isn't
      if (validateGitRepo && !isGitRepo) {
        return {
          isSuccess: false,
          message:
            "Directory is not a git repository. Please select a valid git repository.",
          data: undefined,
        };
      }

      const successMessage = isGitRepo
        ? "Git repository detected"
        : `Directory contains ${fileCount} files and ${dirCount} folders`;

      return {
        isSuccess: true,
        message: successMessage,
        data: resolvedPath,
      };
    } catch (error) {
      // Process specific error types
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

      // Rethrow unknown errors to be caught by outer catch
      throw error;
    }
  } catch (error: unknown) {
    console.error(`Error validating directory ${directoryPath}:`, error);
    return handleActionError(error) as ActionState<string | null>;
  }
}

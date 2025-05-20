import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

import * as tauriFs from "../utils/tauri-fs";

const DEBUG_LOGS = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true"; // Enable logs in development

/**
 * Directory information returned by the list directories action
 */
interface DirectoryInfo {
  name: string;
  path: string;
  isAccessible: boolean;
}

//-------------------------------------------------------------------------
// Directory and file operations
//-------------------------------------------------------------------------

/**
 * Get common paths from the system
 */
export async function getCommonPaths(): Promise<DirectoryInfo[]> {
  try {
    // Use tauriFs to get common paths
    const commonPaths = await tauriFs.getCommonPaths();
    return commonPaths.map(
      (dirInfo: { name: string; path: string; is_accessible: boolean }) => ({
        name: dirInfo.name,
        path: dirInfo.path,
        isAccessible: dirInfo.is_accessible,
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
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // Normalize the path
    const resolvedPath = await tauriFs.normalizePath(directoryPath);

    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

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
      .map((file: { name: string; path: string; is_readable?: boolean }) => ({
        name: file.name,
        path: file.path,
        isAccessible: file.is_readable === undefined ? true : file.is_readable,
      }));

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
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

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

/**
 * Read a file from a given external path
 */
export async function readExternalFileAction(
  filePath: string
): Promise<ActionState<{ [key: string]: string }>> {
  try {
    if (!filePath) {
      return {
        isSuccess: false,
        message: "No file path provided",
      };
    }

    // Use tauriFs to read file content
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    const content = await tauriFs.readFileContent(filePath, undefined, "utf8");

    const fileInfo: { [key: string]: string } = {};
    fileInfo[filePath] = content;

    return {
      isSuccess: true,
      data: fileInfo,
      message: `Successfully read file: ${filePath}`,
    };
  } catch (error: unknown) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to read file",
    };
  }
}

//-------------------------------------------------------------------------
// Directory validation
//-------------------------------------------------------------------------

/**
 * Validates a directory path to ensure it exists, is accessible, and optionally check if it's a git repository
 */
export async function validateDirectoryAction(
  directoryPath: string,
  validateGitRepo: boolean = true
): Promise<ActionState<string | null>> {
  if (!directoryPath?.trim()) {
    return {
      isSuccess: false,
      message: "Directory path cannot be empty",
      data: null,
    };
  }

  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }
    const resolvedPath = await tauriFs.normalizePath(directoryPath);
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

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
          data: validateGitRepo ? null : resolvedPath,
        };

        return emptyDirResult;
      }

      // Count files and directories
      let fileCount = 0;
      let dirCount = 0;

      // Process the listing results to count files and directories
      for (const file of files as { is_dir: boolean }[]) {
        if (file.is_dir) {
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
          data: null,
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
            data: null,
          };
        } else if (errorMessage.includes("not a directory")) {
          return {
            isSuccess: false,
            message: "Path exists but is not a directory",
            data: null,
          };
        } else if (errorMessage.includes("permission denied")) {
          return {
            isSuccess: false,
            message:
              "Directory exists but cannot be read. Please check permissions.",
            data: null,
          };
        }
      }

      // Rethrow unknown errors to be caught by outer catch
      throw error;
    }
  } catch (error: unknown) {
    console.error(`Error validating directory ${directoryPath}:`, error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return {
      isSuccess: false,
      message: `Failed to access directory: ${errorMessage}`,
      data: null,
    };
  }
}

//-------------------------------------------------------------------------
// Directory reading as background jobs
//-------------------------------------------------------------------------

/**
 * Interface for read directory job request arguments
 */
export interface ReadDirectoryRequestArgs {
  sessionId: string;
  directoryPath: string;
  excludePatterns?: string[];
}

/**
 * Interface for read directory job response
 */
export interface ReadDirectoryCommandResponse {
  jobId: string;
}

/**
 * Interface for read directory job result data
 */
export interface ReadDirectoryResultData {
  directory: string;
  files: string[];
  count: number;
}

/**
 * Helper to parse read directory job data
 */
export function parseReadDirectoryJobData(
  jobResponse: string
): ReadDirectoryResultData {
  try {
    // Parse the response into the expected format with proper type definition
    const parsed = JSON.parse(jobResponse) as { 
      directory?: string; 
      files?: string[]; 
      count?: number 
    };

    return {
      directory: parsed.directory || "",
      files: Array.isArray(parsed.files) ? parsed.files : [],
      count: typeof parsed.count === "number" ? parsed.count : 0,
    };
  } catch (error) {
    console.error("Error parsing read directory job data:", error);
    return {
      directory: "",
      files: [],
      count: 0,
    };
  }
}

/**
 * Creates a background job to read a directory structure
 * @param sessionId The session ID
 * @param directoryPath The directory path to read
 * @param excludePatterns Optional patterns to exclude from results
 * @returns A promise resolving to an ActionState with job ID
 */
export async function readDirectoryAction(
  sessionId: string,
  directoryPath: string,
  excludePatterns?: string[]
): Promise<ActionState<{ jobId?: string }>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    if (!directoryPath || !directoryPath.trim()) {
      return {
        isSuccess: false,
        message: "No project directory provided",
      };
    }

    // Create a background job for directory reading
    const response = await invoke<string>(
      "task_create_read_directory_job_command",
      {
        sessionId,
        directoryPath,
        excludePatterns: excludePatterns || [],
      }
    );

    // Return success with the job ID
    return {
      isSuccess: true,
      message:
        "Directory scanning job created. Track progress in the background jobs panel.",
      data: { jobId: response },
      metadata: {
        jobId: response,
      },
    };
  } catch (error) {
    console.error("[readDirectoryAction] Error:", error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to start directory reading",
      error:
        error instanceof Error ? error : new Error("Failed to read directory"),
    };
  }
}

/**
 * Creates a background job to generate a directory tree
 * @param sessionId The session ID
 * @param directoryPath The directory path to process
 * @param excludePatterns Optional patterns to exclude from results
 * @returns A promise resolving to an ActionState with job ID
 */
export async function createGenerateDirectoryTreeJobAction(
  sessionId: string,
  directoryPath: string,
  excludePatterns?: string[]
): Promise<ActionState<{ jobId?: string }>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    if (!directoryPath || !directoryPath.trim()) {
      return {
        isSuccess: false,
        message: "No project directory provided",
      };
    }

    // Create a background job for directory tree generation
    const jobId = await invoke<string>(
      "create_generate_directory_tree_job_command",
      {
        sessionId,
        directoryPath,
        excludePatterns: excludePatterns || [],
      }
    );

    // Return success with the job ID
    return {
      isSuccess: true,
      message: "Directory tree generation job created",
      data: { jobId },
      metadata: {
        jobId,
      },
    };
  } catch (error) {
    console.error("[createGenerateDirectoryTreeJobAction] Error:", error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to start directory tree generation",
      error:
        error instanceof Error
          ? error
          : new Error("Failed to generate directory tree"),
    };
  }
}

/**
 * Gets the files from a read directory job result
 * Note: This method may need to be replaced by a direct job fetch from the background jobs system
 * @param jobId The job ID to get results from
 * @returns A promise resolving to an ActionState with file list
 */
export async function getReadDirectoryResultAction(
  jobId: string
): Promise<ActionState<{ files: string[]; directory: string; count: number }>> {
  try {
    if (!jobId || !jobId.trim()) {
      return {
        isSuccess: false,
        message: "Invalid job ID provided",
        data: { files: [], directory: "", count: 0 },
      };
    }

    // This command may need to be implemented in the Rust backend or replaced with a generic job result retrieval
    console.warn(
      "getReadDirectoryResultAction uses a command that may not be implemented in the Rust backend."
    );
    console.warn(
      "Consider using the background job system to fetch the job result directly."
    );

    // Get the job result
    try {
      const result = await invoke<{
        directory: string;
        files: string[];
        count: number;
      }>("get_read_directory_result_command", { jobId });

      return {
        isSuccess: true,
        message: `Found ${result.count} files in directory`,
        data: result,
      };
    } catch (error) {
      // If specific command is not implemented, this should be handled gracefully
      console.error(
        "Error with get_read_directory_result_command, this may not be implemented:",
        error
      );
      return {
        isSuccess: false,
        message:
          "Failed to get directory reading results - command not implemented",
        data: { files: [], directory: "", count: 0 },
      };
    }
  } catch (error) {
    console.error("[getReadDirectoryResultAction] Error:", error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to get directory reading results",
      data: { files: [], directory: "", count: 0 },
    };
  }
}
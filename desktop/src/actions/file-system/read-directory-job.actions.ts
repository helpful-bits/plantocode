import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

const DEBUG_LOGS = import.meta.env.DEV; // Enable logs in development

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
      // Debug logging is conditional and useful for development
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
      // Debug logging is conditional and useful for development
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

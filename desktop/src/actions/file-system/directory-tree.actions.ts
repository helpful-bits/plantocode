import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

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
    if (!directoryPath || !directoryPath.trim()) {
      return {
        isSuccess: false,
        message: "No project directory provided",
      };
    }

    // Create a background job for directory tree generation
    const invokeResult = await invoke<{ jobId: string }>(
      "create_generate_directory_tree_job_command",
      {
        sessionId,
        projectDirectory: directoryPath,
        options: excludePatterns && excludePatterns.length > 0 ? { excludePatterns: excludePatterns } : null,
      }
    );

    // Return success with the job ID
    return {
      isSuccess: true,
      message: "Directory tree generation job created",
      data: { jobId: invokeResult.jobId },
      metadata: {
        jobId: invokeResult.jobId,
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
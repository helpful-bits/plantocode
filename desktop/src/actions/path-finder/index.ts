import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Finds relevant files for a given task
 */
export async function findRelevantFilesAction({
  sessionId,
  taskDescription,
  options = {},
}: {
  sessionId: string;
  taskDescription: string;
  options?: Partial<{
    modelOverride?: string;
    temperatureOverride?: number;
    maxTokensOverride?: number;
    projectDirectory?: string;
    includedFiles?: string[];
    forceExcludedFiles?: string[];
    includeFileContents?: boolean;
    maxFilesWithContent?: number;
    priorityFileTypes?: string[];
    directoryTree?: string;
  }>;
}): Promise<ActionState<{ jobId: string }>> {
  try {
    // Validate required inputs
    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Invalid or missing session ID",
      };
    }

    if (!taskDescription || taskDescription.trim().length < 10) {
      return {
        isSuccess: false,
        message:
          "Task description is required and must be at least 10 characters",
      };
    }

    // Backend will handle model configuration resolution using crate::config
    // We only pass overrides if explicitly provided

    // Construct PathFinderOptionsArgs to match Rust struct
    const currentOptions = options || {};
    const pathFinderOptionsArg = {
      includeFileContents: currentOptions.includeFileContents,
      maxFilesWithContent: currentOptions.maxFilesWithContent,
      priorityFileTypes: currentOptions.priorityFileTypes,
      includedFiles: currentOptions.includedFiles?.length ? currentOptions.includedFiles : null,
      excludedFiles: currentOptions.forceExcludedFiles?.length ? currentOptions.forceExcludedFiles : null,
    };

    // Check if all fields in pathFinderOptionsArg are null or undefined to pass null for the whole struct
    const allOptionsNull = Object.values(pathFinderOptionsArg).every(val => val === null || val === undefined);

    // Invoke the Tauri command to find relevant files
    const result = await invoke<{ jobId: string }>(
      "find_relevant_files_command",
      {
        sessionId: sessionId,
        taskDescription: taskDescription,
        projectDirectory: currentOptions.projectDirectory ?? null,
        modelOverride: currentOptions.modelOverride ?? null,
        temperatureOverride: currentOptions.temperatureOverride ?? null,
        maxTokensOverride: currentOptions.maxTokensOverride ?? null,
        options: allOptionsNull ? null : pathFinderOptionsArg,
        directoryTree: currentOptions.directoryTree ?? null,
      }
    );

    return {
      isSuccess: true,
      message: "Path finder job started",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}

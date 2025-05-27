import { invoke } from "@tauri-apps/api/core";

import { getModelSettingsForProject } from "@/actions/project-settings";
import { getRuntimeAIConfig } from "@/actions/config.actions";
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
    projectDirectory?: string;
    includedFiles?: string[];
    forceExcludedFiles?: string[];
    includeFileContents?: boolean;
    maxFilesWithContent?: number;
    priorityFileTypes?: string[];
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

    // Get path finder settings from RuntimeAIConfig (loaded from server database)
    const runtimeConfig = await getRuntimeAIConfig();
    if (!runtimeConfig?.isSuccess || !runtimeConfig.data?.tasks?.pathFinder) {
      return {
        isSuccess: false,
        message: "Runtime AI configuration not available. Please ensure server connection is established.",
      };
    }

    const pathfinderDefaults = runtimeConfig.data.tasks.pathFinder;
    const pathfinderSettings = {
      model: pathfinderDefaults.model,
      temperature: pathfinderDefaults.temperature,
      maxTokens: pathfinderDefaults.maxTokens,
    };

    if (options.projectDirectory) {
      try {
        const modelSettingsResult = await getModelSettingsForProject(
          options.projectDirectory
        );
        if (modelSettingsResult?.isSuccess && modelSettingsResult.data?.pathFinder) {
          const pathFinderSettings = modelSettingsResult.data.pathFinder;
          if (pathFinderSettings.model) {
            pathfinderSettings.model = pathFinderSettings.model;
          }

          if (pathFinderSettings.temperature !== undefined) {
            pathfinderSettings.temperature = pathFinderSettings.temperature;
          }

          if (pathFinderSettings.maxTokens) {
            pathfinderSettings.maxTokens = pathFinderSettings.maxTokens;
          }
        }
      } catch (err) {
        // Could not load project settings for path finder, continuing with defaults
        // Continue with defaults
      }
    }

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
        projectDirectory: currentOptions.projectDirectory,
        modelOverride: currentOptions.modelOverride || pathfinderSettings.model,
        temperatureOverride: pathfinderSettings.temperature,
        maxTokensOverride: pathfinderSettings.maxTokens,
        options: allOptionsNull ? null : pathFinderOptionsArg,
      }
    );

    return {
      isSuccess: true,
      message: "Path finder job started",
      data: { jobId: result.jobId },
    };
  } catch (error) {
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}

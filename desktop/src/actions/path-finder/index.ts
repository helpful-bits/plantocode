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
    if (!runtimeConfig?.isSuccess || !runtimeConfig.data?.tasks?.path_finder) {
      return {
        isSuccess: false,
        message: "Runtime AI configuration not available. Please ensure server connection is established.",
      };
    }

    const pathfinderDefaults = runtimeConfig.data.tasks.path_finder;
    const pathfinderSettings = {
      model: pathfinderDefaults.model,
      temperature: pathfinderDefaults.temperature,
      maxTokens: pathfinderDefaults.max_tokens,
    };

    if (options.projectDirectory) {
      try {
        const modelSettings = await getModelSettingsForProject(
          options.projectDirectory
        );
        if (modelSettings && modelSettings.pathFinder) {
          if (modelSettings.pathFinder.model) {
            pathfinderSettings.model = modelSettings.pathFinder.model;
          }

          if (modelSettings.pathFinder.temperature !== undefined) {
            pathfinderSettings.temperature =
              modelSettings.pathFinder.temperature;
          }

          if (modelSettings.pathFinder.maxTokens) {
            pathfinderSettings.maxTokens = modelSettings.pathFinder.maxTokens;
          }
        }
      } catch (err) {
        console.warn("Could not load project settings for path finder:", err);
        // Continue with defaults
      }
    }

    // Invoke the Tauri command to find relevant files with direct parameter passing
    const result = await invoke<{ job_id: string }>(
      "find_relevant_files_command",
      {
        args: {
          session_id: sessionId,
          task_description: taskDescription,
          options: {
            include_file_contents: options.includeFileContents,
            included_files: options.includedFiles || [],
            excluded_files: options.forceExcludedFiles || [],
          },
          model_override: options.modelOverride || pathfinderSettings.model,
          temperature_override: pathfinderSettings.temperature,
          max_tokens_override: pathfinderSettings.maxTokens,
          project_directory: options.projectDirectory,
        },
      }
    );

    return {
      isSuccess: true,
      message: "Path finder job started",
      data: { jobId: result.job_id },
    };
  } catch (error) {
    return handleActionError(error, "Failed to find relevant files") as ActionState<{ jobId: string }>;
  }
}

import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Generate regex patterns for file finding based on task description
 */
export async function generateRegexPatternsAction(
  sessionId: string,
  projectDirectory: string,
  taskDescription: string,
  directoryTree?: string,
  options?: {
    modelOverride?: string;
    temperatureOverride?: number;
    maxTokensOverride?: number;
  }
): Promise<ActionState<{ jobId: string }>> {
  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return {
      isSuccess: false,
      message: "Invalid or missing session ID for regex pattern generation",
    };
  }

  if (!projectDirectory || !projectDirectory.trim()) {
    return { isSuccess: false, message: "Project directory is required" };
  }

  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }

  try {
    // Call the Tauri command to generate regex patterns
    const result = await invoke<{ jobId: string; duration_ms?: number }>("generate_regex_patterns_command", {
      sessionId,
      projectDirectory,
      taskDescription,
      directoryTree: directoryTree ?? null,
      modelOverride: options?.modelOverride ?? null,
      temperatureOverride: options?.temperatureOverride ?? null,
      maxTokensOverride: options?.maxTokensOverride ?? null,
    });

    // Return success with job ID
    return {
      isSuccess: true,
      message: "Regex pattern generation job queued",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
        targetField: "regexPatterns",
        duration_ms: result.duration_ms,
      },
    };
  } catch (error) {
    console.error("[generateRegexPatternsAction]", error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}
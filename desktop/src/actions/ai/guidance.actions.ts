import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

/**
 * Generate guidance for specific file paths
 */
export async function generateGuidanceForPathsAction(
  taskDescription: string,
  paths: string[],
  sessionId: string,
  projectDirectory: string,
  options?: {
    modelOverride?: string;
    temperatureOverride?: number;
    maxTokensOverride?: number;
    systemPromptOverride?: string;
    fileContentsSummary?: string;
  }
): Promise<ActionState<{ jobId: string }>> {
  if (!taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty" };
  }

  if (!paths.length) {
    return { isSuccess: false, message: "No paths provided" };
  }

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return {
      isSuccess: false,
      message: "Invalid or missing session ID for guidance generation",
    };
  }

  if (!projectDirectory || !projectDirectory.trim()) {
    return { isSuccess: false, message: "Project directory is required" };
  }

  try {
    // Call the Tauri command to generate guidance
    const result = await invoke<{ jobId: string }>("generate_guidance_command", {
      sessionId,
      projectDirectory,
      taskDescription,
      paths,
      fileContentsSummary: options?.fileContentsSummary,
      systemPromptOverride: options?.systemPromptOverride,
      modelOverride: options?.modelOverride,
      temperatureOverride: options?.temperatureOverride,
      maxTokensOverride: options?.maxTokensOverride,
    });

    // Return success with job ID
    return {
      isSuccess: true,
      message: "Guidance generation job queued",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
        targetField: "taskDescription",
      },
    };
  } catch (error) {
    console.error("[generateGuidanceForPathsAction]", error);

    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error generating guidance",
      error: error instanceof Error ? error : new Error("Unknown error"),
    };
  }
}

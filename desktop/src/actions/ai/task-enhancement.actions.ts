import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

/**
 * Enhance a task description with more details and clarity
 */
export async function enhanceTaskDescriptionAction({
  taskDescription,
  projectContext,
  projectDirectory,
  sessionId,
  targetField,
  modelOverride,
  temperatureOverride,
  maxTokensOverride,
}: {
  taskDescription: string;
  projectContext?: string;
  projectDirectory?: string;
  sessionId: string;
  targetField?: string;
  modelOverride?: string;
  temperatureOverride?: number;
  maxTokensOverride?: number;
}): Promise<ActionState<{ jobId: string }>> {
  try {
    if (!taskDescription || !taskDescription.trim()) {
      return { isSuccess: false, message: "Task description cannot be empty." };
    }

    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Active session required to enhance task.",
      };
    }


    // Call the Tauri command for task enhancement
    const result = await invoke<{ job_id: string }>(
      "enhance_task_description_command",
      {
        sessionId,
        taskDescription,
        projectContext,
        projectDirectory,
        targetField,
        modelOverride,
        temperatureOverride,
        maxTokensOverride,
      }
    );


    return {
      isSuccess: true,
      message: "Task enhancement job started",
      data: { jobId: result.job_id },
      metadata: {
        jobId: result.job_id,
        targetField,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    console.error(`[enhanceTaskDescriptionAction] Error:`, error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to enhance task description",
    };
  }
}

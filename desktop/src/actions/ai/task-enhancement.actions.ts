import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

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
    const result = await invoke<{ jobId: string }>(
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
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        targetField,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    console.error(`[enhanceTaskDescriptionAction] Error:`, error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}

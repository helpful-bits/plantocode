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


    // If no projectDirectory provided, derive it from the session
    let finalProjectDirectory = projectDirectory;
    if (!finalProjectDirectory && sessionId) {
      try {
        const sessionDetails = await invoke<{ projectDirectory: string }>("get_session_command", {
          sessionId: sessionId,
        });
        if (sessionDetails?.projectDirectory) {
          finalProjectDirectory = sessionDetails.projectDirectory;
        }
      } catch (error) {
        console.warn("Could not retrieve project directory from session:", error);
      }
    }

    // Call the Tauri command for task enhancement
    const result = await invoke<{ jobId: string }>(
      "enhance_task_description_command",
      {
        sessionId,
        taskDescription,
        projectContext: projectContext ?? null,
        projectDirectory: finalProjectDirectory ?? null,
        targetField: targetField ?? null,
        modelOverride: modelOverride ?? null,
        temperatureOverride: temperatureOverride ?? null,
        maxTokensOverride: maxTokensOverride ?? null,
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

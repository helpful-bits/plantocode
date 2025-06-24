import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Refine a task description to be more detailed and actionable
 */
export async function refineTaskDescriptionAction({
  taskDescription,
  projectDirectory,
  sessionId,
  relevantFiles,
}: {
  taskDescription: string;
  projectDirectory?: string;
  sessionId: string;
  relevantFiles?: string[];
}): Promise<ActionState<{ jobId: string }>> {
  try {
    if (!taskDescription || !taskDescription.trim()) {
      return { isSuccess: false, message: "Task description cannot be empty." };
    }

    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Active session required to refine task.",
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

    // Call the Tauri command for task refinement
    const result = await invoke<{ jobId: string; duration_ms?: number }>(
      "refine_task_description_command",
      {
        sessionId,
        taskDescription,
        relevantFiles: relevantFiles ?? [],
        projectDirectory: finalProjectDirectory ?? "",
      }
    );

    return {
      isSuccess: true,
      message: "Task refinement job started",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
        duration_ms: result.duration_ms,
      },
    };
  } catch (error) {
    console.error(`[refineTaskDescriptionAction] Error:`, error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}
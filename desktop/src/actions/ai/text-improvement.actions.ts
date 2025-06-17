import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Create a background job to improve text
 */
export async function createImproveTextJobAction({
  text,
  sessionId,
  projectDirectory,
}: {
  text: string;
  sessionId: string;
  projectDirectory?: string;
}): Promise<ActionState<{ jobId: string }>> {
  try {
    if (!text || !text.trim()) {
      return { isSuccess: false, message: "Text cannot be empty." };
    }

    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Active session required to improve text.",
      };
    }

    // Call the Tauri command for text improvement
    const result = await invoke<{ jobId: string }>(
      "improve_text_command",
      {
        sessionId,
        textToImprove: text,
        projectDirectory: projectDirectory ?? "",
        originalTranscriptionJobId: null,
      }
    );

    return {
      isSuccess: true,
      message: "Text improvement job started",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    console.error(`[createImproveTextJobAction] Error:`, error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}
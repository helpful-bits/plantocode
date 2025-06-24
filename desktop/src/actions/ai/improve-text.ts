import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Creates a job to improve text quality and content
 */
export async function createImproveTextJobAction(
  text: string,
  sessionId: string,
  originalJobId: string | null,
  projectDirectory?: string
): Promise<ActionState<{ jobId: string }>> {
  try {
    // Validate inputs
    if (!text || !text.trim()) {
      return {
        isSuccess: false,
        message: "No text provided for improvement.",
      };
    }

    // Validate session ID
    if (!sessionId) {
      return {
        isSuccess: false,
        message: "A valid session ID is required for text improvement",
      };
    }

    // Call the Tauri command to create a text improvement job
    // Ensure projectDirectory is undefined if not available (matches Rust Option<String>)
    const result = await invoke<{ jobId: string; duration_ms?: number }>(
      "improve_text_command",
      {
        sessionId: sessionId,
        textToImprove: text,
        originalTranscriptionJobId: originalJobId ?? null,
        projectDirectory: projectDirectory ?? null,
      }
    );

    return {
      isSuccess: true,
      message: "Text improvement job started",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
        originalTranscriptionJobId: originalJobId,
        duration_ms: result.duration_ms,
      },
    };
  } catch (error) {
    console.error("[TextImprovement] Error creating improvement job:", error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}
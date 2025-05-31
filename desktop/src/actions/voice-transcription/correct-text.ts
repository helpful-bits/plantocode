import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Creates a job to correct and improve text (consolidates voice correction and post-transcription correction)
 */
export async function createTextCorrectionJobAction(
  text: string,
  sessionId: string,
  originalJobId: string | null,
  projectDirectory?: string,
  language: string = "en"
): Promise<ActionState<{ jobId: string }>> {
  try {
    // Validate inputs
    if (!text || !text.trim()) {
      return {
        isSuccess: false,
        message: "No text provided for correction.",
      };
    }

    // Validate session ID
    if (!sessionId) {
      return {
        isSuccess: false,
        message: "A valid session ID is required for text correction",
      };
    }

    // Call the Tauri command to create a text correction job
    // Ensure projectDirectory is undefined if not available (matches Rust Option<String>)
    const result = await invoke<{ jobId: string }>(
      "correct_text_command",
      {
        session_id: sessionId,
        text_to_correct: text,
        original_transcription_job_id: originalJobId ?? null,
        project_directory: projectDirectory ?? null,
        language,
      }
    );

    return {
      isSuccess: true,
      message: "Text correction job started",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
        originalTranscriptionJobId: originalJobId,
      },
    };
  } catch (error) {
    console.error("[TextCorrection] Error creating correction job:", error);
    return handleActionError(error) as ActionState<{ jobId: string }>;
  }
}

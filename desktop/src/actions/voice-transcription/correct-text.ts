import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

/**
 * Creates a job to correct and improve transcribed text
 */
export async function createVoiceCorrectionJobAction(
  text: string,
  language: string = "en",
  sessionId: string,
  originalJobId: string | null,
  projectDirectory: string
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

    // Call the Tauri command to create a voice correction job
    const result = await invoke<{ job_id: string }>(
      "correct_transcription_command",
      {
        args: {
          session_id: sessionId,
          text_to_correct: text,
          language: language,
          original_job_id: originalJobId || undefined,
          project_directory: projectDirectory,
        },
      }
    );

    return {
      isSuccess: true,
      message: "Text correction job started",
      data: { jobId: result.job_id },
      metadata: {
        jobId: result.job_id,
        isBackgroundJob: true,
        originalTranscriptionJobId: originalJobId,
      },
    };
  } catch (error) {
    console.error("[TextCorrection] Error creating correction job:", error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to start text correction",
    };
  }
}

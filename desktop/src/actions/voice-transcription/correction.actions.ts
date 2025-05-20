import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

/**
 * Creates a job to correct transcribed text from speech-to-text
 */
export async function correctTaskDescriptionAction(
  textToCorrect: string,
  language: string = "en",
  sessionId: string,
  projectDirectory?: string,
  originalJobId?: string
): Promise<ActionState<{ jobId: string }>> {
  try {
    if (!textToCorrect || !textToCorrect.trim()) {
      return { isSuccess: false, message: "No text provided for correction." };
    }

    if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Valid session ID is required for voice correction",
      };
    }

    // Call the Tauri command to create a voice correction job
    const result = await invoke<{ job_id: string }>(
      "correct_transcription_command",
      {
        args: {
          session_id: sessionId,
          text_to_correct: textToCorrect,
          language,
          project_directory: projectDirectory,
          original_job_id: originalJobId,
        },
      }
    );

    return {
      isSuccess: true,
      message: "Voice correction job started",
      data: { jobId: result.job_id },
      metadata: {
        operationId: result.job_id,
        status: "pending",
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    console.error("Error starting voice correction:", error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to start voice correction",
    };
  }
}

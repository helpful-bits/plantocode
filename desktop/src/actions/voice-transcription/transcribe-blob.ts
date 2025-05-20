import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { WHISPER_MAX_FILE_SIZE_MB } from "@/utils/constants";

// For debug logging
const DEBUG_LOGS = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true";

/**
 * Transcribes an audio blob directly (non-background job)
 * Converts the blob to base64 and invokes the direct Tauri command
 */
export async function transcribeAudioBlob(
  audioBlob: Blob
): Promise<{ text: string }> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    if (!audioBlob) {
      console.error("[Voice Transcription] No audio blob provided");
      throw new Error("No audio data was provided");
    }

    // Check if audio file is too large
    const fileSizeMB = audioBlob.size / (1024 * 1024);
    if (fileSizeMB > WHISPER_MAX_FILE_SIZE_MB) {
      throw new Error(
        `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${WHISPER_MAX_FILE_SIZE_MB}MB.`
      );
    }

    // Convert Blob to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Generate filename
    const filename = `recording_${Date.now()}.wav`;

    // Use the direct transcription Tauri command
    const response = await invoke<{ text: string }>(
      "transcribe_audio_direct_command",
      {
        args: {
          audio_data: Array.from(uint8Array),
          filename: filename,
          model: "", // Empty string will use the default model
        },
      }
    );

    return response;
  } catch (error) {
    console.error(
      "[Voice Transcription] Error in direct blob transcription:",
      error
    );
    throw new Error(
      error instanceof Error ? error.message : "Transcription failed"
    );
  }
}

/**
 * Creates a job to transcribe a voice recording from a Blob
 * by converting it to base64 and invoking the Tauri command directly
 */
export async function createTranscriptionJobFromBlobAction(
  audioBlob: Blob,
  // Marking language as unused with underscore prefix to satisfy ESLint
  _language: string = "en",
  sessionId: string,
  projectDirectory: string
): Promise<ActionState<{ jobId: string }>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    if (!audioBlob) {
      console.error("[Voice Transcription] No audio blob provided");
      return {
        isSuccess: false,
        message: "No audio data was provided",
      };
    }

    // Check if audio file is too large
    const fileSizeMB = audioBlob.size / (1024 * 1024);
    if (fileSizeMB > WHISPER_MAX_FILE_SIZE_MB) {
      return {
        isSuccess: false,
        message: `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${WHISPER_MAX_FILE_SIZE_MB}MB.`,
      };
    }

    // Validate session ID
    if (!sessionId) {
      return {
        isSuccess: false,
        message: "A valid session ID is required for voice transcription",
      };
    }

    // Convert Blob to base64
    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryString = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i]);
    }
    const base64Audio = btoa(binaryString);

    // Generate filename
    const filename = `recording_${Date.now()}.wav`;

    // Call the Tauri command directly
    const result = await invoke<{ job_id: string }>(
      "create_transcription_job_command",
      {
        args: {
          session_id: sessionId,
          audio_data: base64Audio,
          filename,
          project_directory: projectDirectory,
        },
      }
    );

    return {
      isSuccess: true,
      message: "Transcription job started",
      data: { jobId: result.job_id },
      metadata: {
        jobId: result.job_id,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    console.error("[Voice Transcription] Error:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Transcription failed",
    };
  }
}
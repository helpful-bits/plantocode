import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { WHISPER_MAX_FILE_SIZE_MB } from "@/utils/constants";
import { getErrorMessage, createTranscriptionErrorMessage, logError } from "@/utils/error-handling";
import { handleActionError } from "@/utils/action-utils";

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
      const errorMsg = "No audio data was provided";
      await logError(new Error(errorMsg), "Voice Transcription - Missing Audio Blob");
      throw new Error(errorMsg);
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
        audioData: Array.from(uint8Array),
        filename: filename,
        model: "", // Empty string will use the default model
      }
    );

    return response;
  } catch (error) {
    let errorMessage = "Tauri audio transcription (blob) failed";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      // Attempt to parse if it's a JSON string from Tauri panic or AppError
      try {
        const parsedError = JSON.parse(error);
        if (parsedError && parsedError.message) {
          errorMessage = `Transcription error: ${parsedError.message}`;
        } else {
          errorMessage = `Transcription error: ${error}`;
        }
      } catch (e) {
        errorMessage = `Transcription error: ${error}`;
      }
    }
    await logError(error, "Voice Transcription - Direct Blob Transcription", { audioSize: audioBlob?.size });
    throw new Error(createTranscriptionErrorMessage(errorMessage));
  }
}

/**
 * Creates a job to transcribe a voice recording from a Blob
 * by converting it to base64 and invoking the Tauri command directly
 */
export async function createTranscriptionJobFromBlobAction(
  audioBlob: Blob,
  sessionId: string,
  projectDirectory?: string
): Promise<ActionState<{ jobId: string }>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    if (!audioBlob) {
      const errorMsg = "No audio data was provided";
      await logError(new Error(errorMsg), "Voice Transcription Job - Missing Audio Blob");
      return {
        isSuccess: false,
        message: errorMsg,
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
    // Ensure projectDirectory is undefined if not available (matches Rust Option<String>)
    const result = await invoke<{ jobId: string }>(
      "create_transcription_job_command",
      {
        sessionId,
        audioData: base64Audio,
        filename,
        projectDirectory: projectDirectory || undefined,
      }
    );

    return {
      isSuccess: true,
      message: "Transcription job started",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    await logError(error, "Voice Transcription Job - Creation Failed", { 
      sessionId, 
      audioSize: audioBlob?.size,
      projectDirectory 
    });
    
    const errorState = handleActionError(error);
    return {
      ...errorState,
      error: error instanceof Error ? error : new Error(getErrorMessage(error))
    } as ActionState<{ jobId: string }>;
  }
}
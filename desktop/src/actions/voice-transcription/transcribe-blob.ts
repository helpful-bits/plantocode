import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { WHISPER_MAX_FILE_SIZE_MB } from "@/utils/constants";
import { extractErrorInfo, createUserFriendlyErrorMessage, getErrorMessage, logError } from "@/utils/error-handling";

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
        audio_data: Array.from(uint8Array),
        filename: filename,
        model: "", // Empty string will use the default model
      }
    );

    return response;
  } catch (error) {
    await logError(error, "transcribeAudioBlob", { audioSize: audioBlob?.size });
    throw new Error(getErrorMessage(error, 'transcription'));
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
        session_id: sessionId,
        audio_data: base64Audio,
        filename,
        project_directory: projectDirectory ?? null,
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
    await logError(error, "createTranscriptionJobFromBlobAction", { 
      sessionId, 
      audioSize: audioBlob?.size,
      projectDirectory 
    });
    
    const errorInfo = extractErrorInfo(error);
    const userMessage = createUserFriendlyErrorMessage(errorInfo, "voice transcription");
    
    return {
      isSuccess: false,
      message: userMessage,
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'transcription'))
    } as ActionState<{ jobId: string }>;
  }
}
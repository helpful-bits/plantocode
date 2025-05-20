import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { WHISPER_MAX_FILE_SIZE_MB } from "@/utils/constants";

// For debug logging
const DEBUG_LOGS = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true";

/**
 * Interface for the direct transcription response
 */
interface DirectTranscribeAudioResponse {
  text: string;
}

//-------------------------------------------------------------------------
// Direct Transcription
//-------------------------------------------------------------------------

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
        audioData: Array.from(uint8Array),
        filename: filename,
        model: "", // Empty string will use the default model
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
 * Transcribes audio data directly using the Tauri command
 * Use for immediate transcription needs (non-background job)
 */
export async function transcribeBase64Audio(
  base64Audio: string
): Promise<DirectTranscribeAudioResponse> {
  try {
    if (!base64Audio) {
      console.error("[Voice Transcription] No base64 audio data provided");
      throw new Error("No audio data was provided");
    }

    // Remove data:audio/whatever;base64, prefix if present
    const cleanBase64 = base64Audio.includes("base64,")
      ? base64Audio.split("base64,")[1]
      : base64Audio;

    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // Convert base64 to byte array for direct transcription
    const binaryString = atob(cleanBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Generate filename
    const filename = `recording_${Date.now()}.wav`;

    // Invoke the direct transcription Tauri command
    const response = await invoke<DirectTranscribeAudioResponse>(
      "transcribe_audio_direct_command",
      {
        audioData: Array.from(bytes),
        filename,
        model: "", // Empty string will use the default model
      }
    );

    return response;
  } catch (error) {
    console.error("Error during direct audio transcription via Tauri:", error);
    throw new Error("Tauri audio transcription failed");
  }
}

//-------------------------------------------------------------------------
// Background Job Transcription
//-------------------------------------------------------------------------

/**
 * Creates a job to transcribe audio data from a base64-encoded string
 * This version uses the background job system
 */
export async function transcribeAudioAction(
  base64Audio: string,
  sessionId: string,
  projectDirectory?: string,
  filename = "recording.wav"
): Promise<ActionState<{ jobId: string }>> {
  try {
    if (!base64Audio) {
      console.error("[Voice Transcription] No base64 audio data provided");
      return {
        isSuccess: false,
        message: "No audio data was provided",
      };
    }

    if (!sessionId || !sessionId.trim()) {
      return {
        isSuccess: false,
        message: "Session ID is required for transcription",
      };
    }

    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // Remove data:audio/whatever;base64, prefix if present
    const cleanBase64 = base64Audio.includes("base64,")
      ? base64Audio.split("base64,")[1]
      : base64Audio;

    // Call the Tauri command to create a transcription job
    const result = await invoke<{ job_id: string }>(
      "create_transcription_job_command",
      {
        sessionId,
        audioData: cleanBase64,
        filename,
        projectDirectory,
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
      message:
        error instanceof Error
          ? error.message
          : "Failed to start audio transcription",
    };
  }
}

/**
 * Creates a job to transcribe a voice recording from a Blob
 * by converting it to base64 and invoking the Tauri command directly
 */
export async function createTranscriptionJobFromBlobAction(
  audioBlob: Blob,
  // Marking language parameter as unused with underscore prefix
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
        sessionId,
        audioData: base64Audio,
        filename,
        projectDirectory,
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

//-------------------------------------------------------------------------
// Text Correction
//-------------------------------------------------------------------------

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
        sessionId,
        textToCorrect: text,
        language,
        originalJobId: originalJobId || undefined,
        projectDirectory,
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

/**
 * Creates a job to correct transcribed text from speech-to-text
 */
export async function correctTaskDescriptionAction(
  textToCorrect: string,
  // Marking language parameter as unused with underscore prefix
  _language: string = "en",
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
        sessionId,
        textToCorrect,
        language: _language, // Using the parameter here to avoid unused
        projectDirectory,
        originalJobId,
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
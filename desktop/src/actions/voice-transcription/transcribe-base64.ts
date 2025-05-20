import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";

// For debug logging
const DEBUG_LOGS = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true";

/**
 * Interface for the direct transcription response
 */
interface DirectTranscribeAudioResponse {
  text: string;
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
        args: {
          audio_data: Array.from(bytes),
          filename,
          model: "", // Empty string will use the default model
        },
      }
    );

    return response;
  } catch (error) {
    console.error("Error during direct audio transcription via Tauri:", error);
    throw new Error("Tauri audio transcription failed");
  }
}

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
        args: {
          session_id: sessionId,
          audio_data: cleanBase64,
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
      message:
        error instanceof Error
          ? error.message
          : "Failed to start audio transcription",
    };
  }
}
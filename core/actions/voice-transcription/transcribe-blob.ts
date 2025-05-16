"use server";

import { ActionState } from '@core/types';
import { WHISPER_MAX_FILE_SIZE_MB } from '@core/lib/constants';
import { ensureSessionRecord } from '@core/lib/db/utils/session-db-utils';
import { apiClients } from '@core/lib/api/client-factory';

/**
 * Transcribe a voice recording from a Blob using OpenRouter's Whisper implementation
 *
 * This version uses the OpenRouter API client directly rather than the utility function,
 * providing better error handling and consistency with other API clients.
 */
export async function transcribeVoiceAction(
  audioBlob: Blob,
  language: string = "en",
  sessionId: string | null = "",
  projectDirectory: string
): Promise<ActionState<{ text: string; jobId: string }>> {
  try {
    console.log(`[Voice Transcription] Processing audio blob (${audioBlob?.size || 'unknown'} bytes) with sessionId: ${sessionId || 'none'}`);

    if (!audioBlob) {
      console.error("[Voice Transcription] No audio blob provided");
      return {
        isSuccess: false,
        message: "No audio data was provided",
        data: { text: "", jobId: "" }
      };
    }

    // Check if audio file is too large
    const fileSizeMB = audioBlob.size / (1024 * 1024);
    if (fileSizeMB > WHISPER_MAX_FILE_SIZE_MB) {
      return {
        isSuccess: false,
        message: `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${WHISPER_MAX_FILE_SIZE_MB}MB.`,
        data: { text: "", jobId: "" }
      };
    }

    // Validate session ID
    if (!sessionId) {
      return {
        isSuccess: false,
        message: "A valid session ID is required for voice transcription",
        data: { text: "", jobId: "" }
      };
    }

    // Get a guaranteed valid session ID using our utility
    // This will check if the session exists and throw an error if it doesn't
    let dbSafeSessionId: string;
    try {
      dbSafeSessionId = await ensureSessionRecord(sessionId, projectDirectory, 'Voice Transcription');
    } catch (error) {
      console.error("[Voice Transcription] Session validation error:", error);
      return {
        isSuccess: false,
        message: error instanceof Error ? error.message : "Invalid session ID",
        data: { text: "", jobId: "" }
      };
    }

    // Get the OpenRouter API client
    const openRouterClient = apiClients.get('openrouter');

    // Make the API request using the standardized client
    // This will create a background job and handle all the API interaction
    const result = await openRouterClient.sendRequest(audioBlob, {
      sessionId: dbSafeSessionId,
      projectDirectory,
      language,
      taskType: "transcription",
      forceBackgroundJob: true, // Always run as background job for better UX with long transcriptions
      metadata: {
        audioSize: audioBlob.size,
        mimeType: audioBlob.type
      }
    });

    // Handle the response based on whether it was processed immediately or as a background job
    if (result.isSuccess) {
      if (typeof result.data === 'string') {
        // Direct response with transcription text (shouldn't happen with forceBackgroundJob=true)
        return {
          isSuccess: true,
          message: "Transcription completed",
          data: {
            text: result.data,
            jobId: result.metadata?.jobId || ""
          }
        };
      } else if (typeof result.data === 'object' && 'isBackgroundJob' in result.data) {
        // Background job response with job ID
        return {
          isSuccess: true,
          message: "Transcription job started",
          data: {
            text: "", // Text will be available via job updates
            jobId: result.data.jobId
          }
        };
      }
    }

    // If we get here, there was an error
    return {
      isSuccess: false,
      message: result.message || "Transcription failed",
      data: {
        text: "",
        jobId: result.metadata?.jobId || ""
      },
      error: result.error || new Error("Transcription failed")
    };
  } catch (error) {
    console.error("[Voice Transcription] Error:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Transcription failed",
      data: { text: "", jobId: "" }
    };
  }
}
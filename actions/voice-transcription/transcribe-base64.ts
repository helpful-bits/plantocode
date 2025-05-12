"use server";

import { ActionState } from "@/types";
import { WHISPER_MAX_FILE_SIZE_MB } from '@/lib/constants';
import { ensureSessionRecord } from '@/lib/db/utils/session-db-utils';
import { apiClients } from '@/lib/api/client-factory';
import { handleApiClientError } from '@/lib/api/api-error-handling';

/**
 * Transcribe audio data from a base64-encoded string using Groq's Whisper implementation
 *
 * This version uses the standardized GroqApiClient directly for better error handling
 * and consistency with other API clients.
 */
export async function transcribeAudioAction(
  base64Audio: string,
  language: string = "en",
  sessionId: string | null,
  projectDirectory: string
): Promise<ActionState<{ text: string; jobId: string }>> {
  try {
    if (!base64Audio) {
      console.error("[Voice Transcription] No base64 audio data provided");
      return {
        isSuccess: false,
        message: "No audio data was provided",
        data: { text: "", jobId: "" }
      };
    }

    console.log(`[Voice Transcription] Processing base64 audio (${Math.round(base64Audio.length / 1024)} KB)`);

    // Check if audio file is too large
    const fileSizeMB = base64Audio.length / (1024 * 1024 * 1.33); // Approximate size accounting for base64 overhead
    if (fileSizeMB > WHISPER_MAX_FILE_SIZE_MB) {
      return {
        isSuccess: false,
        message: `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${WHISPER_MAX_FILE_SIZE_MB}MB.`,
        data: { text: "", jobId: "" }
      };
    }

    // Get a guaranteed valid session ID using our utility
    const dbSafeSessionId = await ensureSessionRecord(sessionId, projectDirectory, 'Base64 Transcription');

    // Remove data:audio/whatever;base64, prefix if present
    const cleanBase64 = base64Audio.includes("base64,")
      ? base64Audio.split("base64,")[1]
      : base64Audio;

    // Convert base64 to binary
    const binaryData = Buffer.from(cleanBase64, 'base64');

    // Attempt to detect the mime type from the base64 prefix
    let mimeType = 'audio/wav'; // Default
    if (base64Audio.includes('data:')) {
      const mimeMatch = base64Audio.match(/data:([^;]+);/);
      if (mimeMatch && mimeMatch[1]) {
        mimeType = mimeMatch[1];
      }
    }

    // Create a Blob from the binary data
    const audioBlob = new Blob([binaryData], { type: mimeType });

    // Get the Groq API client
    const groqClient = apiClients.groq;

    // Call the client with direct request instead of using the utility function
    const result = await groqClient.sendRequest(audioBlob, {
      sessionId: dbSafeSessionId,
      projectDirectory,
      language,
      taskType: "transcription",
      forceBackgroundJob: true, // Always run as background job for better UX with potentially long transcriptions
      metadata: {
        audioSize: binaryData.length,
        mimeType,
        sourceType: 'base64'
      }
    });

    // Handle the response
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

    // Use the standardized error handling for the outer catch block
    const errorResult = await handleApiClientError(error, {
      apiType: 'groq',
      logPrefix: '[Voice Transcription]'
    });

    return {
      ...errorResult,
      data: { text: "", jobId: "" }
    };
  }
}
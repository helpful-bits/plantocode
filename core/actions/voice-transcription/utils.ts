"use server";

import { ActionState } from '@core/types';
import { BackgroundJob } from '@core/types/session-types';
import { apiClients } from '@core/lib/api/client-factory';
import { handleApiClientError, createApiSuccessResponse } from '@core/lib/api/api-error-handling';

/**
 * Shared utility function to handle transcription using Groq's Whisper API.
 * This centralizes the common logic between transcribe-blob.ts and transcribe-base64.ts
 *
 * This version uses the standardized GroqApiClient instead of direct fetch calls
 * to leverage common error handling and response formatting.
 *
 * @param audioBlob The audio blob to transcribe
 * @param language The language code (e.g., "en" for English)
 * @param runningJob The background job tracking this transcription
 * @param projectDirectory The project directory
 * @returns The transcribed text
 */
export async function transcribeAudioWithGroq(
  audioBlob: Blob,
  language: string,
  runningJob: BackgroundJob,
  projectDirectory: string
): Promise<string> {
  try {
    // Get the Groq API client
    const groqClient = apiClients.groq;

    // Call the client with the job ID to continue using the existing job
    const result = await groqClient.sendRequest(audioBlob, {
      language,
      sessionId: runningJob.sessionId,
      projectDirectory,
      forceBackgroundJob: false, // Process within this request since we already have a job
      jobId: runningJob.id, // Pass the existing job ID to update instead of creating new
      metadata: {
        // Any additional metadata can be passed here
        audioSize: audioBlob.size,
        mimeType: audioBlob.type
      }
    });

    // If successful, return the transcription text
    if (result.isSuccess && typeof result.data === 'string') {
      return result.data;
    }

    // If the response indicates it's a background job (shouldn't happen with forceBackgroundJob: false)
    if (result.isSuccess && typeof result.data === 'object' && 'isBackgroundJob' in result.data) {
      throw new Error("Unexpected background job response when immediate processing was requested");
    }

    // If we get here, there was an error but not one that triggered an exception
    // Log the error with a clear structure for debugging
    console.error("[Voice Transcription] API error:", {
      message: result.message,
      errorType: result.metadata?.errorType || 'UNKNOWN_ERROR',
      details: result.error?.message || 'No details available'
    });

    throw new Error(result.message || "Unknown error during transcription");
  } catch (error) {
    // We're rethrowing this error to maintain compatibility with the calling code
    // which expects exceptions to propagate
    console.error("[Voice Transcription] Error during transcription:", error);
    throw error;
  }
}
"use client";

import { ActionState } from "@/types";
import { BackgroundJob } from "@/types/session-types";

// Validation function to check if transcription text is valid
export function validateTranscriptionText(text: string | null): { isValid: boolean, reason?: string } {
  if (!text) {
    return { isValid: false, reason: "Transcription is empty" };
  }
  
  // Minimum text requirement
  if (text.trim().length < 3) {
    return { isValid: false, reason: "Transcription is too short" };
  }
  
  // Check for common error responses that might be returned as text
  if (text.includes("Error:") && text.includes("API") && text.length < 100) {
    return { isValid: false, reason: "Transcription contains API error message" };
  }
  
  return { isValid: true };
}

/**
 * Handles voice transcription using the transcribeVoiceAction server action.
 * Sends the audio blob to the Groq API and returns the transcription result.
 */
export async function handleTranscription(
  audioBlob: Blob,
  sessionId?: string | null
): Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>> {
  try {
    if (!audioBlob) {
      console.error('[Transcription] No audio blob provided');
      return {
        isSuccess: false,
        message: "No audio data provided",
        data: ""
      };
    }
    
    if (audioBlob.size === 0) {
      console.error('[Transcription] Audio blob size is zero');
      return {
        isSuccess: false,
        message: "Empty audio data, no sound was recorded",
        data: ""
      };
    }
    
    // Check for very small audio blobs that might cause transcription to fail
    if (audioBlob.size < 500) {
      console.error(`[Transcription] Audio blob size critically small: ${audioBlob.size} bytes`);
      return {
        isSuccess: false,
        message: "Audio recording too short or silent, please try again",
        data: ""
      };
    }
    
    // Log the sessionId type and value for debugging
    console.log(`[Transcription] Processing audio blob (${audioBlob.size} bytes), sessionId type: ${typeof sessionId}, value:`, sessionId);
    
    // Ensure sessionId is either a string or null before proceeding
    if (sessionId !== null && typeof sessionId !== 'string') {
      console.error(`[Transcription] Invalid sessionId type: ${typeof sessionId}, using empty string instead`);
      sessionId = "";
    }
    
    // Determine MIME type - use a standardized value that Groq can process
    // The server's extensionMap supports these types
    const mimeType = audioBlob.type || 'audio/webm';
    console.log(`[Transcription] Using MIME type: ${mimeType}`);
    
    // Import dynamically to avoid Next.js server component issues
    const { transcribeVoiceAction } = await import('@/actions/voice-transcription/transcribe-blob');
    
    // Call the server action with the proper parameters
    const result = await transcribeVoiceAction(
      audioBlob,
      "en", // Default language
      sessionId || "" // Ensure we pass a string
    );
    
    console.log(`[Transcription] Request completed: ${result.isSuccess ? 'success' : 'failure'}`);
    if (!result.isSuccess) {
      console.error(`[Transcription] Error: ${result.message}`);
      return {
        isSuccess: false,
        message: result.message,
        data: ""
      };
    } 
    
    // Handle the response format where data contains both text and jobId
    if (result.data && typeof result.data === 'object' && 'text' in result.data && 'jobId' in result.data) {
      const { text, jobId } = result.data;
      console.log(`[Transcription] Received text of length: ${text?.length || 0}, jobId: ${jobId}`);
      
      // If there's immediate text available and it's not empty
      if (text && text.trim()) {
        // Return the text plus job metadata
        return {
          isSuccess: true,
          message: result.message || "Transcription completed",
          data: text,
          metadata: {
            jobId
          }
        };
      } else {
        // Return as background job if there's no immediate text or processing still needed
        return {
          isSuccess: true,
          message: result.message || "Transcription submitted as background job",
          data: { isBackgroundJob: true, jobId },
          metadata: {
            jobId
          }
        };
      }
    }
    
    // Fallback for any other response format
    return {
      ...result,
      data: result.data === undefined ? "" : result.data as string | { isBackgroundJob: true; jobId: string }
    };
  } catch (error) {
    console.error("Error in handleTranscription:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Transcription failed",
      data: ""
    };
  }
}

/**
 * Handles text correction using the correctTextAction server action.
 * Sends the transcribed text to the API for correction and improvement.
 */
export async function handleCorrection(
  text: string,
  sessionId?: string | null
): Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>> {
  try {
    if (!text) {
      return {
        isSuccess: false,
        message: "No text provided for correction",
        data: ""
      };
    }
    
    try {
      // Try to import the module
      const { correctTextAction } = await import('@/actions/voice-transcription/correct-text');
      
      // Call the server action with sessionId
      const result = await correctTextAction(text, "en", sessionId);
      
      // Process the response to ensure consistent format
      if (result.isSuccess) {
        if (typeof result.data === 'object' && result.data && 'isBackgroundJob' in result.data && 'jobId' in result.data) {
          // Already in the right format for background job
          return result;
        } else if (typeof result.data === 'string') {
          // Got immediate text response
          return {
            isSuccess: true,
            message: "Text correction completed",
            data: result.data,
            metadata: result.metadata || {}
          };
        }
      }
      
      return result;
    } catch (importError) {
      // If the module doesn't exist yet, return a fallback
      console.warn("Could not import correctTextAction, returning original text:", importError);
      return {
        isSuccess: true,
        message: "Correction module not available, returned original text",
        data: text
      };
    }
  } catch (error) {
    console.error("Error in handleCorrection:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Correction failed",
      data: ""
    };
  }
}

/**
 * Process background jobs by their ID and return relevant information
 */
export function processBackgroundJob(
  job: BackgroundJob | undefined,
  processedJobs: Set<string>
): {
  processed: boolean;
  text: string | null;
  error: string | null;
  status: "completed" | "failed" | "processing";
} {
  // If no job or already processed, return default values
  if (!job || processedJobs.has(job.id)) {
    return { processed: false, text: null, error: null, status: "processing" };
  }
  
  // Job is completed
  if (job.status === "completed") {
    // Mark as processed
    processedJobs.add(job.id);
    
    // Get the text from the response field (source of truth)
    const text = job.response || null;
    
    return {
      processed: true,
      text,
      error: null,
      status: "completed"
    };
  }
  
  // Job failed
  if (job.status === "failed" || job.status === "canceled") {
    // Mark as processed
    processedJobs.add(job.id);
    
    return {
      processed: true,
      text: null,
      error: job.errorMessage || job.statusMessage || "Operation failed",
      status: "failed"
    };
  }
  
  // Job is still processing
  return {
    processed: false,
    text: null,
    error: null,
    status: "processing"
  };
} 
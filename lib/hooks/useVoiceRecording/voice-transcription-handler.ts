"use client";

import { ActionState } from "@/types";
import { BackgroundJob, JOB_STATUSES } from "@/types/session-types";

// Validation function to check if transcription text is valid
/**
 * Enhanced validation function for transcription text
 * Performs comprehensive checks to ensure text is usable for UI display
 *
 * @param text The text to validate
 * @returns Object indicating validity and reason if invalid
 */
export function validateTranscriptionText(text: string | null): { isValid: boolean, reason?: string } {
  // Check for null/undefined/empty
  if (!text) {
    return { isValid: false, reason: "Transcription is empty" };
  }

  const trimmedText = text.trim();

  // Minimum text requirement
  if (trimmedText.length < 3) {
    return { isValid: false, reason: "Transcription is too short" };
  }

  // Check for common error responses
  if (trimmedText.includes("Error:") &&
      (trimmedText.includes("API") || trimmedText.includes("failed")) &&
      trimmedText.length < 100) {
    return { isValid: false, reason: "Transcription contains error message" };
  }

  // Check if text appears to be a UUID
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(trimmedText)) {
    return { isValid: false, reason: "Transcription appears to be an ID, not text" };
  }

  // Check for JSON object strings that should have been parsed
  if ((trimmedText.startsWith('{') && trimmedText.endsWith('}')) ||
      (trimmedText.startsWith('[') && trimmedText.endsWith(']'))) {
    try {
      JSON.parse(trimmedText);
      return { isValid: false, reason: "Transcription appears to be unparsed JSON" };
    } catch (e) {
      // If it doesn't parse as JSON, it's probably just text that happens to have brackets
    }
  }

  // Check for very suspicious/odd patterns
  if (trimmedText.includes("undefined") && trimmedText.length < 20) {
    return { isValid: false, reason: "Transcription contains programming artifact" };
  }

  if (trimmedText.includes("<ERROR>") || trimmedText.includes("[ERROR]")) {
    return { isValid: false, reason: "Transcription contains error marker" };
  }

  // All checks passed
  return { isValid: true };
}

/**
 * Processes a direct text transcription result
 *
 * @param text The transcription text to process
 * @param isCorrectionPhase Whether this is a correction phase or initial transcription
 * @param autoCorrect Whether to automatically correct the transcription
 * @param sessionId The current session ID
 * @param transcriptionJobId The current job ID for updating
 * @param projectDirectory The project directory path
 * @param setRawText State setter for raw text
 * @param setCorrectedText State setter for corrected text
 * @param setTextStatus State setter for text status
 * @param updateState Function to update component state
 * @param onTranscribed Callback for when text is transcribed
 * @param onCorrectionComplete Callback for when correction is completed
 * @returns Promise that resolves when processing is complete
 */
export async function processDirectTranscriptionResult(
  text: string,
  isCorrectionPhase: boolean,
  autoCorrect: boolean,
  sessionId: string | null,
  transcriptionJobId: string | null,
  projectDirectory: string | undefined,
  setRawText: (text: string | null) => void,
  setCorrectedText: (text: string | null) => void,
  setTextStatus: (status: 'loading' | 'done' | 'error' | undefined) => void,
  updateState: (state: Partial<{
    isRecording: boolean;
    isProcessing: boolean;
    error: string | null;
  }>) => void,
  onTranscribed?: (text: string) => void,
  onCorrectionComplete?: (rawText: string, correctedText: string) => void
): Promise<void> {
  try {
    // Validate the text
    const validation = validateTranscriptionText(text);

    if (!validation.isValid) {
      console.warn(`[VoiceRecording] Invalid ${isCorrectionPhase ? 'correction' : 'transcription'}: ${validation.reason}`);
      updateState({
        isProcessing: false,
        error: `Failed to process voice: ${validation.reason || 'Invalid result'}`
      });
      setTextStatus('error');
      return;
    }

    // Process based on phase
    if (isCorrectionPhase) {
      setCorrectedText(text);

      // More robust handling of callbacks for correction phase
      const currentRawText = text; // This would normally come from state in the hook

      // First, properly handle onCorrectionComplete if available
      if (onCorrectionComplete) {
        try {
          console.log(`[VoiceCorrection] Calling onCorrectionComplete with corrected text (length: ${text.length})`);
          onCorrectionComplete(currentRawText, text);
        } catch (callbackError) {
          console.error('[VoiceCorrection] Error in onCorrectionComplete callback:', callbackError);
          // Continue even if callback fails - don't block the process
        }
      }

      // Then update UI with the corrected text via onTranscribed, with error handling
      if (onTranscribed) {
        try {
          console.log(`[VoiceCorrection] Calling onTranscribed with corrected text`);
          onTranscribed(text);
        } catch (callbackError) {
          console.error('[VoiceCorrection] Error in onTranscribed callback:', callbackError);
          // Continue even if callback fails
        }
      }

      setTextStatus('done');
    } else {
      // Set the raw transcribed text
      setRawText(text);

      // If auto-correct is enabled, send for correction
      if (autoCorrect) {
        // Start correction process
        setTextStatus('loading');
        const correctionResult = await handleCorrection(text, sessionId, transcriptionJobId, projectDirectory);

        // Recursive processing for correction phase
        if (correctionResult.isSuccess && typeof correctionResult.data === 'string') {
          await processDirectTranscriptionResult(
            correctionResult.data,
            true, // correction phase
            autoCorrect,
            sessionId,
            transcriptionJobId,
            projectDirectory,
            setRawText,
            setCorrectedText,
            setTextStatus,
            updateState,
            onTranscribed,
            onCorrectionComplete
          );
        } else if (correctionResult.isSuccess &&
                  typeof correctionResult.data === 'object' &&
                  'isBackgroundJob' in correctionResult.data) {
          // Correction submitted as background job, status will be updated by job monitoring effect
          return;
        } else {
          // Correction failed but we have raw text, so mark as done
          // Still use the raw text in this fallback case
          console.log('[VoiceRecording] Correction failed, falling back to raw transcription text');

          if (onTranscribed) {
            try {
              console.log(`[VoiceRecording] Calling onTranscribed with raw text due to correction failure`);
              onTranscribed(text);
            } catch (callbackError) {
              console.error('[VoiceRecording] Error in onTranscribed callback during fallback:', callbackError);
            }
          }

          setTextStatus('done');
        }
      } else {
        // No correction, we're done with raw text only
        console.log('[VoiceRecording] No correction needed, using raw transcription text');

        if (onTranscribed) {
          try {
            console.log(`[VoiceRecording] Calling onTranscribed with raw text (auto-correct disabled)`);
            onTranscribed(text);
          } catch (callbackError) {
            console.error('[VoiceRecording] Error in onTranscribed callback with raw text:', callbackError);
          }
        }

        setTextStatus('done');
      }
    }
  } catch (error) {
    console.error('[VoiceRecording] Error processing transcription result:', error);
    updateState({
      error: error instanceof Error ? error.message : 'Error processing recording'
    });
    setTextStatus('error');
  }
}

/**
 * Handles voice transcription using the transcribeVoiceAction server action.
 * Sends the audio blob to the Groq API and returns the transcription result.
 */
export async function handleTranscription(
  audioBlob: Blob,
  sessionId: string | null,
  projectDirectory?: string
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

    // Ensure we have a valid project directory
    const effectiveProjectDirectory = (projectDirectory && typeof projectDirectory === 'string' && projectDirectory.trim() !== '')
      ? projectDirectory
      : '/';  // Use root as fallback

    if (!projectDirectory) {
      console.warn(`[Transcription] No project directory provided, using fallback: ${effectiveProjectDirectory}`);
    }

    // Determine MIME type - use a standardized value that Groq can process
    // The server's extensionMap supports these types
    const mimeType = audioBlob.type || 'audio/webm';
    console.log(`[Transcription] Using MIME type: ${mimeType}`);

    // Import dynamically to avoid Next.js server component issues
    const { transcribeVoiceAction } = await import('@/actions/voice-transcription/transcribe-blob');

    // Call the server action with sessionId parameter (which can be null)
    // The server-side ensureSessionRecord utility will handle session validation
    const result = await transcribeVoiceAction(
      audioBlob,
      "en", // Default language
      sessionId, // Pass sessionId directly, server will handle validation and creation
      effectiveProjectDirectory
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
 * Uses the original transcription job ID to update the same job instead of creating a new one.
 */
export async function handleCorrection(
  text: string,
  sessionId: string | null,
  transcriptionJobId: string | null,
  projectDirectory?: string
): Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>> {
  try {
    if (!text) {
      return {
        isSuccess: false,
        message: "No text provided for correction",
        data: ""
      };
    }

    // Ensure we have a valid project directory
    const effectiveProjectDirectory = projectDirectory && typeof projectDirectory === 'string'
      ? projectDirectory
      : '/';

    try {
      // Try to import the module
      const { correctTextAction } = await import('@/actions/voice-transcription/correct-text');

      // Call the server action with sessionId, transcriptionJobId, and projectDirectory
      // The server-side ensureSessionRecord utility will handle session validation
      const result = await correctTextAction(text, "en", sessionId || null, transcriptionJobId, effectiveProjectDirectory);

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
      console.warn("[TextCorrection] Could not import correctTextAction, returning original text:", importError);
      return {
        isSuccess: true,
        message: "Correction module not available, returned original text",
        data: text
      };
    }
  } catch (error) {
    console.error("[TextCorrection] Error in handleCorrection:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Correction failed",
      data: ""
    };
  }
}

/**
 * Process background jobs by their ID and return relevant information
 * This function handles extracting text from various job response formats
 * with robust error handling and validation.
 * 
 * @param job The background job object to process
 * @param processedJobs Set of already processed job IDs to prevent duplicate processing
 * @returns Object with processing status, text content, error message, and status
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

  // Log for debugging
  console.debug(`[processBackgroundJob] Processing job ${job.id} with status ${job.status}`);

  // Job is completed
  if (JOB_STATUSES.COMPLETED.includes(job.status)) {
    // Mark as processed to prevent duplicate processing
    processedJobs.add(job.id);

    // Get the text from the response field (source of truth)
    let text = job.response || null;
    console.debug(`[processBackgroundJob] Job ${job.id} has ${text ? 'response of length ' + text.length : 'no response'}`);

    // Process text if it looks like JSON to extract the actual content
    if (text) {
      // Try to extract content if it looks like JSON
      if ((text.startsWith('{') && text.endsWith('}')) ||
          text.includes('"text":') ||
          text.includes('"response":') ||
          text.includes('"content":')) {
        try {
          const parsed = JSON.parse(text);
          console.debug(`[processBackgroundJob] Successfully parsed JSON response for job ${job.id}`);

          // Extract text from common response formats, looking through all possible field names
          const possibleFields = ['text', 'response', 'content', 'transcription', 'result', 'output', 'data'];

          for (const field of possibleFields) {
            if (parsed[field] && typeof parsed[field] === 'string') {
              console.debug(`[processBackgroundJob] Found content in field "${field}"`);
              text = parsed[field];
              break;
            }
          }

          // Special handling for Claude API response format
          if (parsed.content && Array.isArray(parsed.content)) {
            for (const item of parsed.content) {
              if (item && item.type === 'text' && item.text) {
                console.debug(`[processBackgroundJob] Found content in Claude API format`);
                text = item.text;
                break;
              }
            }
          }

          // Handle deeply nested formats
          if (parsed.result && typeof parsed.result === 'object' && parsed.result !== null) {
            for (const field of possibleFields) {
              if (parsed.result[field] && typeof parsed.result[field] === 'string') {
                console.debug(`[processBackgroundJob] Found content in nested result.${field}`);
                text = parsed.result[field];
                break;
              }
            }
          }
        } catch (e) {
          console.warn(`[processBackgroundJob] Response looks like JSON but couldn't parse:`, e);
          // Continue with original text
        }
      }

      // Handle response cleaning
      if (text) {
        text = text
          .replace(/^"(.*)"$/, '$1') // Remove surrounding quotes if present
          .replace(/\\n/g, '\n')     // Replace escaped newlines with actual newlines
          .replace(/\\"/g, '"');     // Replace escaped quotes with actual quotes

        // Handle specific job types
        if (job.taskType === 'voice_correction') {
          // For correction jobs, apply extra clean-up if needed
          text = text
            .replace(/^Corrected text:\s+/i, '')  // Remove "Corrected text:" prefix
            .replace(/^Here's the corrected text:\s+/i, ''); // Remove another common prefix
        }
      }
      
      // Validate the text after extraction
      const validation = validateTranscriptionText(text);
      if (!validation.isValid) {
        console.warn(`[processBackgroundJob] Invalid text content in job ${job.id}: ${validation.reason}`);
        return {
          processed: true,
          text: null,
          error: `Invalid content: ${validation.reason}`,
          status: "failed"
        };
      }
    } else {
      console.warn(`[processBackgroundJob] Completed job ${job.id} has no response content`);
    }
    
    return {
      processed: true,
      text,
      error: null,
      status: "completed"
    };
  }
  
  // Job failed or was canceled
  if (JOB_STATUSES.FAILED.includes(job.status)) {
    // Mark as processed
    processedJobs.add(job.id);
    
    // Try to extract error message with fallbacks
    const errorMessage = job.errorMessage || job.statusMessage || 
                         (job.status === 'canceled' ? "Operation was canceled" : "Operation failed");
    
    console.debug(`[processBackgroundJob] Job ${job.id} failed with error: ${errorMessage}`);
    
    return {
      processed: true,
      text: null,
      error: errorMessage,
      status: "failed"
    };
  }
  
  // Check for jobs that seem stuck
  if (job.status === 'running' && job.startTime) {
    const runningTimeMs = Date.now() - job.startTime;
    const MAX_RUNNING_TIME = 5 * 60 * 1000; // 5 minutes

    if (runningTimeMs > MAX_RUNNING_TIME) {
      console.warn(`[processBackgroundJob] Job ${job.id} has been running for ${Math.round(runningTimeMs/1000)}s, may be stuck`);
      // We don't mark it as processed yet, but we do return a warning
      return {
        processed: false,
        text: null,
        error: "Job is taking longer than expected",
        status: "processing"
      };
    }

    // For running streaming jobs, we might have partial content
    if (job.metadata?.isStreaming && job.response && job.response.trim()) {
      // Check if this is a long-enough partial response to be useful
      if (job.response.length > 20) {
        // Validate to see if it contains useful text so far
        const validation = validateTranscriptionText(job.response);
        if (validation.isValid) {
          return {
            processed: false, // Not marking as processed yet since it's still running
            text: job.response,
            error: null,
            status: "processing"
          };
        }
      }
    }
  }

  // Job is still processing
  return {
    processed: false,
    text: null,
    error: null,
    status: "processing"
  };
}
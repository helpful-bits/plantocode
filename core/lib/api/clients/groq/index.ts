/**
 * Groq API Client
 * 
 * Implements the ApiClient interface for interacting with Groq's API services,
 * specifically their Whisper implementation for audio transcription.
 */

import { ActionState } from "@core/types";
import { ApiClient, ApiClientOptions } from "../../api-client-interface";
import { WHISPER_MODEL } from "@core/lib/constants";
import { 
  handleApiClientError, 
  createApiSuccessResponse,
  ApiErrorType 
} from "../../api-error-handling";
import { 
  createBackgroundJob, 
  updateJobToRunning, 
  updateJobToCompleted, 
  updateJobToFailed 
} from "@core/lib/jobs/job-helpers";

/**
 * GroqApiClient specific options
 */
export interface GroqApiClientOptions extends ApiClientOptions {
  /**
   * Language code for audio transcription (e.g., "en" for English)
   */
  language?: string;
  
  /**
   * Optional parameter to force the file extension/format
   */
  fileExtension?: string;
}

/**
 * Groq API Client implementation
 * Provides methods for interacting with Groq's services, primarily their Whisper implementation
 */
class GroqApiClient implements ApiClient {
  private apiKey: string;

  constructor() {
    // Get API key from environment variable
    const apiKey = process.env.GROQ_API_KEY;
    
    if (!apiKey) {
      console.error("[GroqApiClient] No API key provided in environment variables");
    }
    
    this.apiKey = apiKey || "";
  }

  /**
   * Send a transcription request to Groq's Whisper API
   *
   * Implementation of the ApiClient interface sendRequest method
   * Note that unlike other API clients, this one accepts a Blob instead of a string prompt
   *
   * @param input Either a Blob for transcription or a string prompt (only Blob is supported)
   * @param options Configuration options for the request
   * @returns Promise resolving to ActionState with transcription text or background job info
   */
  async sendRequest(
    input: string | Blob,
    options?: GroqApiClientOptions
  ): Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>> {
    // Handle the case where input is a string - this client only supports Blob input
    if (typeof input === 'string') {
      return {
        isSuccess: false,
        message: "GroqApiClient only supports Blob input for audio transcription",
        error: new Error("Invalid input: expected audio blob, got string"),
        metadata: {
          errorType: ApiErrorType.INVALID_REQUEST
        }
      };
    }

    // Continue with processing the audio blob
    const audioBlob = input;
    try {
      // Type guard for audio blob
      if (!(audioBlob instanceof Blob)) {
        return {
          isSuccess: false,
          message: "Invalid input: expected audio blob",
          error: new Error("Invalid input: expected audio blob"),
          metadata: {
            errorType: ApiErrorType.INVALID_REQUEST
          }
        };
      }

      // Extract options with defaults
      const {
        sessionId,
        projectDirectory,
        model = WHISPER_MODEL,
        language = "en",
        taskType = "transcription",
        forceBackgroundJob = true,
        jobId, // Existing job ID if provided
        metadata = {}
      } = options || {};

      // Validate required fields
      if (!sessionId) {
        return {
          isSuccess: false,
          message: "Session ID is required for transcription requests",
          error: new Error("Session ID is required"),
          metadata: {
            errorType: ApiErrorType.INVALID_REQUEST
          }
        };
      }

      if (!projectDirectory) {
        return {
          isSuccess: false,
          message: "Project directory is required for transcription requests",
          error: new Error("Project directory is required"),
          metadata: {
            errorType: ApiErrorType.INVALID_REQUEST
          }
        };
      }

      // Check file size (if we want to enforce limits)
      const fileSizeMB = audioBlob.size / (1024 * 1024);
      const maxFileSizeMB = 25; // Default max size for Whisper API

      if (fileSizeMB > maxFileSizeMB) {
        return {
          isSuccess: false,
          message: `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${maxFileSizeMB}MB.`,
          error: new Error(`Audio file too large: ${fileSizeMB.toFixed(2)}MB`),
          metadata: {
            errorType: ApiErrorType.INVALID_REQUEST,
            fileSize: fileSizeMB
          }
        };
      }

      // Determine which job ID to use - either provided or create new
      let effectiveJobId: string;

      if (jobId) {
        // Use the existing job ID if provided
        effectiveJobId = jobId;
        console.log(`[GroqApiClient] Using existing job ID: ${effectiveJobId}`);
      } else {
        // Create a new background job for tracking the transcription
        const backgroundJob = await createBackgroundJob(
          sessionId,
          {
            apiType: "groq",
            taskType: taskType,
            model: model,
            rawInput: `Audio blob transcription request (${(audioBlob.size / 1024).toFixed(1)} KB)`,
            includeSyntax: false,
            temperature: 0.0
          },
          projectDirectory
        );
        effectiveJobId = backgroundJob.id;
        console.log(`[GroqApiClient] Created new job ID: ${effectiveJobId}`);
      }

      // If we're running as a background job, return the job ID immediately
      if (forceBackgroundJob) {
        // Kick off the transcription processing asynchronously
        this.processTranscriptionJob(audioBlob, effectiveJobId, {
          language,
          projectDirectory,
          fileExtension: options?.fileExtension,
        }).catch(error => {
          console.error("[GroqApiClient] Error in background transcription:", error);
        });

        // Return the job ID immediately so the UI can start tracking
        return createApiSuccessResponse(
          { isBackgroundJob: true, jobId: effectiveJobId },
          {
            message: "Transcription job created and processing has started",
            jobId: effectiveJobId,
            isBackgroundJob: true,
            modelInfo: {
              modelUsed: model
            },
            taskType: taskType,
            apiType: "groq"
          }
        );
      }

      // If not running as a background job, process directly
      // Update job to running
      await updateJobToRunning(effectiveJobId, 'groq');

      // Process the transcription
      const result = await this.transcribeAudio(audioBlob, {
        language,
        jobId: effectiveJobId,
      });

      // Return the transcription result with job ID
      return createApiSuccessResponse(
        result.text,
        {
          message: "Transcription completed successfully",
          jobId: effectiveJobId,
          modelInfo: {
            modelUsed: model
          },
          tokenInfo: {
            tokensSent: 0, // Audio doesn't have tokens in the traditional sense
            tokensReceived: result.stats?.tokens || Math.ceil(result.text.length / 4),
            totalTokens: result.stats?.tokens || Math.ceil(result.text.length / 4)
          },
          taskType: taskType,
          apiType: "groq"
        }
      );
    } catch (error) {
      // Use standardized error handling
      return handleApiClientError(error, {
        apiType: "groq",
        logPrefix: "[GroqApiClient]",
        jobId: options?.jobId
      });
    }
  }

  /**
   * Process a transcription job asynchronously
   * This internal method handles the background job processing
   */
  private async processTranscriptionJob(
    audioBlob: Blob,
    jobId: string,
    options: {
      language: string;
      projectDirectory: string;
      fileExtension?: string;
    }
  ): Promise<void> {
    try {
      // Update job to running
      await updateJobToRunning(jobId, 'groq');

      // Process the transcription
      const result = await this.transcribeAudio(audioBlob, {
        language: options.language,
        jobId,
      });

      // Update job to completed with the transcription text
      await updateJobToCompleted(jobId, result.text);
    } catch (error) {
      // Handle and report errors
      console.error("[GroqApiClient] Transcription job failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      await updateJobToFailed(jobId, `Transcription failed: ${errorMessage}`);
    }
  }

  /**
   * Core method to transcribe audio using Groq's Whisper API
   */
  private async transcribeAudio(
    audioBlob: Blob,
    options: {
      language: string;
      jobId?: string;
    }
  ): Promise<{ text: string; stats?: { chars: number; tokens: number } }> {
    // Determine the file extension based on blob's mime type or default to webm
    const mimeType = audioBlob.type.split(';')[0].toLowerCase();
    const extensionMap: Record<string, string> = {
      "audio/flac": "flac",
      "audio/mp3": "mp3",
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/mpga": "mp3",
      "audio/m4a": "m4a",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/x-wav": "wav"
    };

    const extension = extensionMap[mimeType] || "webm";
    const filename = `audio-${Date.now()}.${extension}`;

    // Create form data for the Groq Whisper API
    const form = new FormData();

    // Append the necessary data to the form
    form.append("file", audioBlob, filename);
    form.append("model", WHISPER_MODEL);
    form.append("temperature", "0.0");
    form.append("response_format", "json");
    form.append("language", options.language);

    // Log API request progress to job status if job ID provided
    if (options.jobId) {
      await updateJobToRunning(
        options.jobId,
        'groq',
        `Sending ${(audioBlob.size / 1024).toFixed(1)}KB audio to Groq Whisper API`
      );
    }

    // Prepare API request to Groq's Whisper API
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: form
    });

    // Handle API errors
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[GroqApiClient] Groq API error: ${response.status} - ${errorText}`);

      // Throw a structured error that can be handled by handleApiClientError
      const error = new Error(`Groq API error: ${response.status} - ${errorText}`);
      (error as any).statusCode = response.status;
      throw error;
    }

    // Parse the response
    const result = await response.json();
    const text = result.text || '';

    console.log(`[GroqApiClient] Transcription completed: ${text?.substring(0, 100)}...`);

    // Calculate approximate token count (4 chars per token is a rough estimate)
    const stats = {
      chars: text.length,
      tokens: Math.ceil(text.length / 4)
    };

    return { text, stats };
  }

  /**
   * Cancel all requests for a session (required by ApiClient interface)
   * For transcription, this is a no-op as requests can't be cancelled once sent
   * @param sessionId - The session identifier whose requests should be canceled
   * @returns Promise indicating success or failure with detailed metrics
   */
  async cancelAllSessionRequests(sessionId: string): Promise<ActionState<{
    cancelledQueueRequests: number;
    cancelledBackgroundJobs: number;
  }>> {
    // Transcription requests can't be cancelled once sent to Groq
    // This is a placeholder implementation to satisfy the interface
    return {
      isSuccess: true,
      message: "No active transcription requests to cancel",
      data: {
        cancelledQueueRequests: 0,
        cancelledBackgroundJobs: 0
      }
    };
  }
}

// Export a singleton instance
const groqApiClient = new GroqApiClient();
export default groqApiClient;
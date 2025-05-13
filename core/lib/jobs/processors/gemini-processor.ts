import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { GeminiRequestPayload, JobType } from '../job-types';
import { updateJobToRunning } from '../job-helpers';
import { DEFAULT_TASK_SETTINGS } from '@/lib/constants';
import { getApiClient } from '@/lib/api';
import { handleApiClientError } from '@/lib/api/api-error-handling';

/**
 * Processor for Gemini API requests
 *
 * Handles all Gemini request handling via the standardized API client
 * interface to ensure consistent error handling and response formatting.
 */
export class GeminiProcessor implements JobProcessor<GeminiRequestPayload> {
  /**
   * Process a Gemini API request job
   *
   * @param payload The job payload
   */
  async process(payload: GeminiRequestPayload): Promise<JobProcessResult> {
    const {
      backgroundJobId,
      sessionId,
      apiType = 'gemini',
      promptText,
      systemPrompt,
      metadata,
      maxOutputTokens,
      temperature,
      taskType,
      projectDirectory
    } = payload;

    const model = metadata?.modelUsed || DEFAULT_TASK_SETTINGS.streaming.model;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, apiType, `Running ${model} request`);

      // Get the appropriate API client from the registry
      const apiClient = getApiClient(apiType || 'gemini');

      // Prepare request options with all relevant parameters
      const requestOptions = {
        sessionId,
        jobId: backgroundJobId, // Use existing job ID
        model,
        maxOutputTokens,
        temperature,
        systemPrompt,
        taskType,
        projectDirectory,
        metadata
      };

      // Log operation for debugging
      console.log(`[GeminiProcessor] Processing job ${backgroundJobId} with model ${model || 'default'}`);

      // Send request through standardized client interface
      // Ensure promptText is defined before passing it to the API
      if (!promptText) {
        return {
          success: false,
          message: "Prompt text is required but was undefined or empty",
          error: new Error("Prompt text is required but was undefined or empty"),
          shouldRetry: false
        };
      }

      const result = await apiClient.sendRequest(promptText, requestOptions);

      // Check if successful
      if (!result.isSuccess) {
        return {
          success: false,
          message: result.message,
          error: result.error || new Error(result.message),
          shouldRetry: this.isRetryableError(result.message, result.metadata?.statusCode)
        };
      }

      // Extract response text (sendRequest already updates job status)
      const responseText = typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data);

      // Return success result
      return {
        success: true,
        message: "Successfully processed Gemini API request",
        data: responseText
      };

    } catch (error) {
      console.error(`[GeminiProcessor] Error processing job ${backgroundJobId}:`, error);

      // Use standardized error handling
      const errorResult = await handleApiClientError(error, {
        jobId: backgroundJobId,
        apiType,
        logPrefix: '[GeminiProcessor]'
      });

      // Return error result
      const errorMessage = errorResult.message || 'Unknown error occurred';
      return {
        success: false,
        message: errorMessage,
        error: errorResult.error || new Error(errorMessage),
        shouldRetry: this.isRetryableError(errorMessage, errorResult.metadata?.statusCode)
      };
    }
  }

  /**
   * Determine if an error is retryable
   *
   * @param errorMessage The error message
   * @param statusCode Optional HTTP status code
   * @returns True if the error is retryable, false otherwise
   */
  private isRetryableError(errorMessage: string | undefined, statusCode?: number): boolean {
    // Validate input parameters
    if (!errorMessage) {
      return false; // Without specific error info, default to not retrying
    }

    // If we have a status code, certain status codes are retryable
    if (statusCode) {
      // Rate limiting (429) or server errors (5xx) are retryable
      return statusCode === 429 || statusCode >= 500;
    }

    // Check for common retryable error messages
    const retryableErrorPatterns = [
      /timeout/i,
      /rate limit/i,
      /too many requests/i,
      /temporarily unavailable/i,
      /connection/i,
      /network/i
    ];

    return retryableErrorPatterns.some(pattern => pattern.test(errorMessage));
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE: JobType = 'GEMINI_REQUEST';
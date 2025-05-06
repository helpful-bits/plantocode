import { GeminiRequestPayload, JobType } from '../job-types';
import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import geminiClient from '@/lib/api/gemini-client';
import { ActionState } from '@/types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';

/**
 * Processor for handling Gemini API request jobs
 * This processor is responsible for making requests to the Gemini API
 * and updating the job status accordingly.
 */
export class GeminiRequestProcessor implements JobProcessor<GeminiRequestPayload> {
  /**
   * Process a Gemini request job
   * 
   * @param payload The job payload containing the prompt and configuration
   * @returns A promise that resolves to a JobProcessResult
   */
  async process(payload: GeminiRequestPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId,
      projectDirectory,
      promptText,
      systemPrompt,
      temperature,
      maxOutputTokens,
      apiType,
      taskType,
      metadata
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, apiType || 'gemini');

      // Build request options
      const requestOptions = {
        sessionId,
        projectDirectory,
        model: metadata?.modelUsed,
        maxOutputTokens,
        temperature,
        systemPrompt,
        apiType,
        taskType,
        metadata
      };

      // Send the request to Gemini API
      const result: ActionState<string> = await geminiClient.sendRequest(
        promptText,
        requestOptions
      );

      // Handle the response
      if (result.isSuccess) {
        // For successful requests, we don't need to update the job status here
        // as the geminiClient.sendRequest already updates it to completed
        return {
          success: true,
          message: "Successfully processed Gemini API request",
          data: result.data
        };
      } else {
        // For failed requests, we need to update the job status
        // but geminiClient.sendRequest should have already handled this as well
        // We'll log for visibility but won't update status again to avoid conflicts
        console.warn(
          `[GeminiRequestProcessor] Request failed: ${result.message}`,
          result.metadata
        );
        
        return {
          success: false,
          message: result.message,
          error: new Error(result.message),
          data: result.metadata,
          shouldRetry: result.message ? this.isRetryableError(result.message, result.metadata?.statusCode) : false
        };
      }
    } catch (error) {
      // Handle unexpected errors
      const errorMessage = error instanceof Error 
        ? error.message 
        : String(error);
      
      // Update job to failed status
      await updateJobToFailed(backgroundJobId, errorMessage);
      
      return {
        success: false,
        message: `Error processing Gemini request: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(errorMessage),
        shouldRetry: this.isRetryableError(errorMessage)
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
  private isRetryableError(errorMessage: string, statusCode?: number): boolean {
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

// Export a factory function to create a new processor instance
export function createGeminiRequestProcessor(): JobProcessor<GeminiRequestPayload> {
  return new GeminiRequestProcessor();
}

// Export the job type this processor handles
export const PROCESSOR_TYPE: JobType = 'GEMINI_REQUEST';
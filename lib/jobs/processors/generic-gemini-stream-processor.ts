import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { GenericGeminiStreamPayload } from '../job-types';
import { updateJobToRunning, updateJobToFailed } from '../job-helpers';
import { DEFAULT_TASK_SETTINGS } from '@/lib/constants';
import { getApiClient } from '@/lib/api';
import { handleApiClientError } from '@/lib/api/api-error-handling';

/**
 * Generic Gemini Stream Processor
 *
 * Handles general LLM streaming requests using the Gemini API without
 * application-specific concerns like file writing or transformation.
 * Uses the centralized API client interface for standardized handling.
 */
export class GenericGeminiStreamProcessor implements JobProcessor<GenericGeminiStreamPayload> {
  async process(payload: GenericGeminiStreamPayload): Promise<JobProcessResult> {
    const {
      backgroundJobId,
      sessionId,
      promptText,
      systemPrompt,
      model,
      temperature,
      maxOutputTokens,
      topP,
      topK,
      metadata,
      projectDirectory
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Preparing Gemini API request');

      // Get the appropriate API client from the client factory
      const apiClient = getApiClient('gemini');

      // Verify the client supports streaming
      if (!apiClient.sendStreamingRequest) {
        throw new Error("The API client does not support streaming requests");
      }

      // Build request options
      const requestOptions = {
        sessionId,
        jobId: backgroundJobId,
        model: model || DEFAULT_TASK_SETTINGS.generic_llm_stream.model,
        maxOutputTokens: maxOutputTokens || DEFAULT_TASK_SETTINGS.generic_llm_stream.maxTokens,
        temperature: temperature !== undefined ? temperature : DEFAULT_TASK_SETTINGS.generic_llm_stream.temperature,
        topP: topP || 0.95,
        topK: topK || 40,
        systemPrompt,
        projectDirectory,
        metadata: {
          ...metadata,
          requestType: 'GENERIC_GEMINI_STREAM',
          // Include any other metadata needed for the request
        }
      };

      // Send streaming request through centralized client interface
      const result = await apiClient.sendStreamingRequest(promptText, requestOptions);

      // Check if successful
      if (!result.isSuccess) {
        return {
          success: false,
          message: result.message,
          error: result.error || new Error(result.message)
        };
      }

      // Extract job ID from the response if available
      const jobId = result.data?.jobId || backgroundJobId;
      const requestId = result.data?.requestId;

      // Ensure requestId is defined
      if (!requestId) {
        return {
          success: false,
          message: "Missing requestId in Gemini streaming response",
          error: new Error("Missing requestId in Gemini streaming response"),
          shouldRetry: false
        };
      }

      return {
        success: true,
        message: "Successfully initiated Gemini streaming request",
        data: {
          requestId: requestId,
          jobId: jobId
        }
      };

    } catch (error) {
      // Handle errors with standardized error handling
      console.error(`[GenericGeminiStreamProcessor] Error:`, error);

      // Use standardized error handling
      const errorResult = await handleApiClientError(error, {
        jobId: backgroundJobId,
        apiType: 'gemini',
        logPrefix: '[GenericGeminiStreamProcessor]'
      });

      // Update job status to failed (the handleApiClientError might do this, but let's be sure)
      try {
        await updateJobToFailed(
          backgroundJobId,
          errorResult.message || (error instanceof Error ? error.message : String(error))
        );
      } catch (jobUpdateError) {
        console.error(`[GenericGeminiStreamProcessor] Error updating job status:`, jobUpdateError);
        // Non-fatal error, we continue
      }

      return {
        success: false,
        message: errorResult.message,
        error: errorResult.error || new Error(errorResult.message)
      };
    }
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'GENERIC_GEMINI_STREAM';
import { sendStreamingRequest } from './gemini-streaming';
import { sendRequest } from './gemini-standard';
import { cancelAllSessionJobs } from '@/lib/jobs/job-helpers';
import { ActionState } from '@/types';
import { RequestType } from '@/lib/api/streaming-request-pool-types';
import streamingRequestPool from '@/lib/api/streaming-request-pool';
import { ApiType } from '@/types/session-types';
import { ApiClient, ApiClientOptions } from '@/lib/api/api-client-interface';
import {
  ApiErrorType,
  handleApiClientError,
  createApiSuccessResponse
} from '@/lib/api/api-error-handling';

interface RequestOptions {
  sessionId?: string;
  [key: string]: any;
}

export function sendGeminiRequest(
  promptText: string,
  sessionId: string | null = null,
  options: RequestOptions = {}
): Promise<ActionState<string>> {
  return sendRequest(promptText, { sessionId: sessionId || undefined, ...options });
}

export function sendGeminiStreamingRequest(
  promptText: string,
  sessionId: string | null = null,
  options: RequestOptions = {}
): Promise<ActionState<{ requestId: string; savedFilePath: string | null }>> {
  // Generate a default sessionId if none is provided
  const effectiveSessionId = sessionId || `default_session_${Date.now()}`;
  
  // Create a requestId for tracking
  const requestId = options.requestId || `gemini_stream_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  // Call the refactored function with adapted parameters
  return sendStreamingRequest(promptText, {
    ...options,
    sessionId: effectiveSessionId
  }).then(result => ({
    ...result,
    data: {
      requestId,
      savedFilePath: null
    }
  }));
}

/**
 * Implements the ApiClient interface for Gemini
 */
class GeminiClient implements ApiClient {
  /**
   * Send a standard (non-streaming) request to Gemini
   *
   * @param userPromptContent - The text prompt to send to the model
   * @param options - Configuration options for the request
   * @returns Promise with the model's response
   */
  async sendRequest(
    userPromptContent: string,
    options: ApiClientOptions = {}
  ): Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>> {
    try {
      return await sendRequest(userPromptContent, options);
    } catch (error) {
      return handleApiClientError(error, {
        jobId: options.jobId,
        apiType: options.apiType || 'gemini',
        logPrefix: '[Gemini Client]'
      });
    }
  }

  /**
   * Send a streaming request to Gemini
   *
   * @param promptText - The text prompt to send to the model
   * @param options - Configuration options for the streaming request
   * @returns Promise with the request ID and metadata
   */
  async sendStreamingRequest(
    promptText: string,
    options: ApiClientOptions = {}
  ): Promise<ActionState<{ requestId: string; savedFilePath: string | null; jobId?: string }>> {
    // Create a requestId for tracking
    const requestId = options.requestId ||
      `gemini_stream_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    try {
      // Call the refactored streaming function
      const result = await sendStreamingRequest(promptText, {
        ...options,
        requestId
      });

      // Adapt the new return type to match the expected interface
      return {
        ...result,
        data: {
          requestId,
          savedFilePath: null,
          ...(result.metadata?.jobId ? { jobId: result.metadata.jobId } : {})
        }
      };
    } catch (error) {
      return {
        ...await handleApiClientError(error, {
          jobId: options.jobId,
          apiType: options.apiType || 'gemini',
          logPrefix: '[Gemini Streaming]'
        }),
        data: {
          requestId,
          savedFilePath: null
        }
      };
    }
  }

  /**
   * Cancel a request by its ID
   *
   * @param requestId - The unique ID of the request to cancel
   * @returns Promise indicating success or failure
   */
  async cancelRequest(requestId: string): Promise<ActionState<null>> {
    try {
      // Check if the request is currently in the streaming pool
      if (streamingRequestPool.isActive(requestId)) {
        // Cancel the request in the streaming pool
        streamingRequestPool.cancelRequest(requestId);
        return {
          isSuccess: true,
          message: `Request ${requestId} cancelled successfully`,
          data: null
        };
      } else {
        return {
          isSuccess: false,
          message: `Request ${requestId} not found or already completed`,
          data: null,
          metadata: {
            errorType: ApiErrorType.INVALID_REQUEST
          }
        };
      }
    } catch (error) {
      const errorResult = await handleApiClientError(error, {
        logPrefix: '[Gemini Client]'
      });

      return {
        isSuccess: false,
        message: errorResult.message,
        data: null,
        metadata: errorResult.metadata,
        error: errorResult.error
      };
    }
  }

  /**
   * Cancel all requests for a session
   *
   * @param sessionId - The unique ID of the session to cancel all requests for
   * @returns Promise indicating success or failure with detailed metrics
   */
  async cancelAllSessionRequests(sessionId: string): Promise<ActionState<{
    cancelledQueueRequests: number;
    cancelledBackgroundJobs: number;
  }>> {
    try {
      // Cancel any queued requests through the streaming request pool
      const cancelledQueueRequests = streamingRequestPool.cancelQueuedSessionRequests(sessionId);

      // Also cancel background jobs in the database with the enhanced helper that returns count
      const cancelledBackgroundJobs = await cancelAllSessionJobs(sessionId, 'gemini');

      return {
        isSuccess: true,
        message: `Cancelled ${cancelledQueueRequests} queued and ${cancelledBackgroundJobs} running Gemini requests for session ${sessionId}.`,
        data: {
          cancelledQueueRequests,
          cancelledBackgroundJobs
        },
        metadata: {
          totalCancelled: cancelledQueueRequests + cancelledBackgroundJobs,
          sessionId,
          apiType: 'gemini',
          cancelledAt: Date.now()
        }
      };
    } catch (error) {
      // Use the standard error handling system
      const errorResult = await handleApiClientError(error, {
        logPrefix: '[Gemini Client]',
        apiType: 'gemini'
      });

      return {
        isSuccess: false,
        message: errorResult.message,
        data: {
          cancelledQueueRequests: 0,
          cancelledBackgroundJobs: 0
        },
        metadata: {
          ...errorResult.metadata,
          sessionId
        },
        error: errorResult.error
      };
    }
  }

  /**
   * Get the current queue statistics
   *
   * @returns Object with queue status information
   */
  getQueueStats() {
    return streamingRequestPool.getStats();
  }

  /**
   * Get the current streaming pool statistics
   *
   * @returns Object with pool status information
   */
  getStreamingPoolStats() {
    return streamingRequestPool.getStats();
  }
}

// Create a singleton instance
const __gemini = new GeminiClient();

// Export the singleton instance
export default __gemini;

// Export individual functions and types for direct use - but manage duplicates
export { sendStreamingRequest } from './gemini-streaming';
export { sendRequest } from './gemini-standard';
export { 
  streamGeminiContentWithSDK,
  streamGeminiCompletionWithSDK,
  extractXmlContent
} from './gemini-sdk-handler';

// Re-export types using 'export type' for compatibility with isolatedModules
export type { StreamingUpdateCallback } from './gemini-streaming';
export type { GeminiResponse } from './gemini-standard';
export type { 
  GeminiSdkRequestPayload,
  StreamCallbacks 
} from './gemini-sdk-handler';

// Re-export the payload type to avoid ambiguity (from standard version)
export type { GeminiRequestPayload } from './gemini-standard';
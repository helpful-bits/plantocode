import { sendStreamingRequest } from './gemini-streaming';
import { sendRequest } from './gemini-standard';
import { cancelAllSessionJobs } from '@/lib/jobs/job-helpers';
import { ActionState } from '@/types';
import { RequestType } from '@/lib/api/streaming-request-pool-types';
import streamingRequestPool from '@/lib/api/streaming-request-pool';
import { ApiType } from '@/types/session-types';

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
  return sendStreamingRequest(promptText, effectiveSessionId, options);
}

class GeminiClient {
  /**
   * Send a standard (non-streaming) request to Gemini
   */
  async sendRequest(
    userPromptContent: string,
    options: any = {}
  ): Promise<ActionState<string>> {
    return sendRequest(userPromptContent, options);
  }

  /**
   * Send a streaming request to Gemini
   */
  async sendStreamingRequest(
    promptText: string,
    sessionId: string,
    options: any = {}
  ): Promise<ActionState<{ requestId: string; savedFilePath: string | null }>> {
    return sendStreamingRequest(promptText, sessionId, options);
  }

  /**
   * Cancel a request by its ID
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
          data: null
        };
      }
    } catch (error) {
      console.error(`[Gemini Client] Error cancelling request:`, error);
      return {
        isSuccess: false,
        message: `Error cancelling request: ${error instanceof Error ? error.message : String(error)}`,
        data: null
      };
    }
  }

  /**
   * Cancel all requests for a session
   */
  async cancelAllSessionRequests(sessionId: string): Promise<ActionState<null>> {
    try {
      // Cancel any active streaming requests
      streamingRequestPool.cancelQueuedSessionRequests(sessionId);

      // Also update background job records
      await cancelAllSessionJobs(sessionId, 'gemini');

      return {
        isSuccess: true,
        message: `All requests for session ${sessionId} cancelled successfully`,
        data: null
      };
    } catch (error) {
      console.error(`[Gemini Client] Error cancelling session requests:`, error);
      return {
        isSuccess: false,
        message: `Error cancelling session requests: ${error instanceof Error ? error.message : String(error)}`,
        data: null
      };
    }
  }

  /**
   * Get the current queue statistics
   */
  getQueueStats() {
    return streamingRequestPool.getStats();
  }

  /**
   * Get the current streaming pool statistics
   */
  getStreamingPoolStats() {
    return streamingRequestPool.getStats();
  }
}

// Export a singleton instance
const geminiClient = new GeminiClient();
export default geminiClient;

// Export individual functions and types for direct use - but manage duplicates
export { sendStreamingRequest } from './gemini-streaming';
export { sendRequest } from './gemini-standard';
export { processSseEvent } from './utils/sse-processor';

// Re-export types using 'export type' for compatibility with isolatedModules
export type { StreamingUpdateCallback } from './gemini-streaming';
export type { GeminiResponse } from './gemini-standard';

// Re-export the payload type to avoid ambiguity (from standard version)
export type { GeminiRequestPayload } from './gemini-standard'; 
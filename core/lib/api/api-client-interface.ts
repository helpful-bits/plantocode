/**
 * API Client Interface
 *
 * Standardizes the interface across different LLM API clients (Gemini, Claude, etc.)
 * to ensure consistent error handling, response structure, and background job integration.
 */

import { ActionState } from "@core/types";
import { ApiType, TaskType } from "@core/types/session-types";
// Import the centralized error handling functions
import { handleApiClientError, createApiSuccessResponse } from './api-error-handling';

// Re-export the error handling functions to maintain API stability for consumers
export { handleApiClientError, createApiSuccessResponse };

/**
 * Common base options interface for all API clients
 *
 * This interface defines the standard options that can be passed to any API client,
 * covering request identification, LLM configuration settings, job control parameters,
 * and metadata. Clients may implement a subset of these options depending on their capabilities.
 */
export interface ApiClientOptions {
  // Request identification
  /** Unique identifier for the user session */
  sessionId?: string;
  /** Unique identifier for this specific request */
  requestId?: string;
  /** Existing job ID to use instead of creating a new one */
  jobId?: string;

  // LLM configuration
  /** Model identifier to use for this request (e.g., "gemini-2.5-flash-preview-04-17") */
  model?: string;
  /** Temperature parameter (0-1) controlling randomness in outputs */
  temperature?: number;
  /** Maximum number of tokens to generate in the response */
  maxOutputTokens?: number;
  /** Alias for maxOutputTokens used in some clients */
  maxTokens?: number;
  /** System prompt to set context for the model */
  systemPrompt?: string;
  /** Top-p parameter (0-1) for nucleus sampling */
  topP?: number;
  /** Top-k parameter for limiting token selection */
  topK?: number;

  // Job control
  /** Type of task being performed (e.g., "implementation_plan", "pathfinder") */
  taskType?: TaskType;
  /** Type of API being used (e.g., "gemini", "claude") */
  apiType?: ApiType;
  /** Force this request to run as a background job regardless of size */
  forceBackgroundJob?: boolean;
  /** The root directory of the current project */
  projectDirectory?: string;

  // Metadata
  /** Additional metadata to store with the request */
  metadata?: Record<string, any>;
  /** Human-readable description of the request */
  description?: string;

  // Additional options specific to clients can be added by extending this interface
}

/**
 * Defines the standard API client interface that all LLM clients should implement
 *
 * All API clients should implement this interface to ensure consistent behavior
 * across different LLM providers. The core functionality includes sending requests,
 * streaming responses, and managing request cancellation.
 */
export interface ApiClient {
  /**
   * Send a standard request to the API
   *
   * @param input - The prompt text to send to the LLM
   * @param options - Configuration options for the request
   *   Common options include:
   *   - sessionId: The current session identifier
   *   - model: The specific model to use (e.g., "gemini-2.5-flash-preview-04-17")
   *   - temperature: Controls randomness (0-1)
   *   - maxOutputTokens: Limits response length
   *   - taskType: Categorizes the request (e.g., "implementation_plan")
   *   - forceBackgroundJob: Forces running as a background job
   *
   * @returns A promise resolving to either:
   *   - Success with string data for immediate responses
   *   - Success with {isBackgroundJob: true, jobId: string} for background jobs
   *   - Error state with details about the failure
   */
  sendRequest(
    input: string | any,
    options?: ApiClientOptions
  ): Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>>;

  /**
   * Send a streaming request to the API
   *
   * Used for requests where the response should be streamed back incrementally.
   * Typically used for longer responses or interactive experiences.
   *
   * @param input - The prompt text to send to the LLM
   * @param options - Configuration options for the request (same as sendRequest)
   *
   * @returns A promise resolving to:
   *   - Success with requestId (for tracking/cancellation)
   *   - Optional savedFilePath if the response is saved to disk
   *   - Optional jobId if the streaming request is handled as a background job
   *   - Error state with details about the failure
   */
  sendStreamingRequest?(
    input: string,
    options?: ApiClientOptions
  ): Promise<ActionState<{ requestId: string; savedFilePath?: string | null; jobId?: string }>>;

  /**
   * Cancel a specific request by its ID
   *
   * @param requestId - The unique identifier for the request to cancel
   * @returns A promise resolving to success or error state
   */
  cancelRequest?(requestId: string): Promise<ActionState<null>>;

  /**
   * Cancel all requests for a specific session
   *
   * @param sessionId - The session identifier whose requests should be canceled
   * @returns A promise resolving to success or error state with cancellation metrics
   */
  cancelAllSessionRequests(sessionId: string): Promise<ActionState<{
    cancelledQueueRequests: number;
    cancelledBackgroundJobs: number;
  }>>;

  /**
   * Get statistics about the current request queue and active requests
   *
   * @returns Information about active requests, queue status, and performance metrics
   */
  getQueueStats?(): Record<string, any>;
}
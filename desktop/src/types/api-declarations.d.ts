/**
 * API Client Type Declarations
 *
 * This file provides type declarations to resolve TypeScript errors
 * with the API client interfaces without having to modify existing code.
 */

import { type ActionState } from "./index";

import type { TaskType, ApiType } from "./session-types";

// Declare the module for the API client interface
declare module "@/api/api-client-interface" {
  export interface ApiClient {
    // Improved typing for sendRequest
    sendRequest(
      input: string,
      options?: ApiClientOptions
    ): Promise<ActionState<string | { isBackgroundJob: true; jobId: string }>>;

    // Improved typing for sendStreamingRequest
    sendStreamingRequest?(
      input: string,
      options?: ApiClientOptions
    ): Promise<
      ActionState<{
        requestId: string;
        savedFilePath?: string | null;
        jobId?: string;
      }>
    >;

    // Consistent typing for request management methods
    cancelRequest?(requestId: string): Promise<ActionState<null>>;
    cancelAllSessionRequests(sessionId: string): Promise<
      ActionState<{
        cancelledQueueRequests: number;
        cancelledBackgroundJobs: number;
      }>
    >;

    // More specific return type for getQueueStats
    getQueueStats?(): Record<string, unknown>;
  }

  // Enhanced ApiClientOptions with specific additional properties that might be used
  export interface ApiClientOptions {
    // Base properties from the main interface
    sessionId?: string;
    requestId?: string;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
    maxTokens?: number;
    systemPrompt?: string;
    topP?: number;
    topK?: number;
    taskType?: TaskType;
    apiType?: ApiType;
    forceBackgroundJob?: boolean;
    projectDirectory?: string;
    metadata?: Record<string, unknown>;
    description?: string;

    // Client-specific extensions
    stream?: boolean;
    safetySettings?: Record<string, unknown>; // For Gemini
    candidateCount?: number; // For multiple generations
    presencePenalty?: number; // For some models
    frequencyPenalty?: number; // For some models

    // Allow additional properties for future extensibility
    [key: string]: unknown;
  }
}

// Instead of declaration merging, use interface merging which is safer
declare module "@/api/clients/gemini" {
  // Fix unused type and multiple exports
  // Re-export ApiClient to avoid import error
  export type { ApiClient } from "../api/api-client-interface";
  
  interface GeminiClientModule
    extends ApiClient {
    // Add at least one custom property to avoid the empty interface warning
    geminiSpecificFeature?: boolean;
  }
  const client: GeminiClientModule;
  export default client;
}

declare module "@/api/claude-client" {
  // Fix unused type and multiple exports
  // Re-export ApiClient to avoid import error
  export type { ApiClient } from "../api/api-client-interface";
  
  interface ClaudeClientModule
    extends ApiClient {
    // Add at least one custom property to avoid the empty interface warning
    claudeSpecificFeature?: boolean;
  }
  const client: ClaudeClientModule;
  export default client;
}

// Provide a helper function to safely handle the response data
declare global {
  namespace API {
    function ensureString(
      response: string | { isBackgroundJob: true; jobId: string }
    ): string;
  }
}

// Export the helper globally for use in action files
export {};

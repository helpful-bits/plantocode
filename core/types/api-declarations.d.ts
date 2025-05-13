/**
 * API Client Type Declarations
 * 
 * This file provides type declarations to resolve TypeScript errors
 * with the API client interfaces without having to modify existing code.
 */

import { ActionState } from './index';
import { ApiType } from './session-types';

// Declare the module for the API client interface
declare module '@/lib/api/api-client-interface' {
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
    ): Promise<ActionState<{ requestId: string; savedFilePath?: string | null; jobId?: string }>>;

    // Consistent typing for request management methods
    cancelRequest?(requestId: string): Promise<ActionState<null>>;
    cancelAllSessionRequests(sessionId: string): Promise<ActionState<{
      cancelledQueueRequests: number;
      cancelledBackgroundJobs: number;
    }>>;

    // More specific return type for getQueueStats
    getQueueStats?(): Record<string, any>;
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
    taskType?: import('@/types/session-types').TaskType;
    apiType?: import('@/types/session-types').ApiType;
    forceBackgroundJob?: boolean;
    projectDirectory?: string;
    metadata?: Record<string, any>;
    description?: string;

    // Client-specific extensions
    stream?: boolean;
    safetySettings?: Record<string, any>; // For Gemini
    candidateCount?: number; // For multiple generations
    presencePenalty?: number; // For some models
    frequencyPenalty?: number; // For some models

    // Allow additional properties for future extensibility
    [key: string]: any;
  }
}

// Instead of declaration merging, use interface merging which is safer
declare module '@/lib/api/clients/gemini' {
  export default interface GeminiClientModule extends import('@/lib/api/api-client-interface').ApiClient {}
  const client: GeminiClientModule;
  export default client;
}

declare module '@/lib/api/claude-client' {
  export default interface ClaudeClientModule extends import('@/lib/api/api-client-interface').ApiClient {}
  const client: ClaudeClientModule;
  export default client;
}

// Provide a helper function to safely handle the response data
declare global {
  namespace API {
    function ensureString(response: string | { isBackgroundJob: true; jobId: string }): string;
  }
}

// Export the helper globally for use in action files
export {};
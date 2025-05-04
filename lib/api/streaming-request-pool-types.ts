// Type definitions for requests
export enum RequestType {
  GEMINI_CHAT = 'gemini_chat',      // Standard chat request
  CODE_ANALYSIS = 'code_analysis',   // Code analysis request
  GENERAL = 'general',               // Any other request
  FILE_OPERATION = 'file_operation', // Added file operation type with highest priority
  CLAUDE_REQUEST = 'claude_request',  // Requests to Claude API
  WHISPER_REQUEST = 'whisper_request', // Requests to Whisper API for transcription
  VOICE_TRANSCRIPTION = 'voice_transcription', // Voice transcription requests
  PROCESSING = 'processing' // General processing requests
}

// Type definitions for fetch
export type RequestInfo = string | URL | Request;
export type FetchOptions = RequestInit;
export type Response = globalThis.Response;

// Active request information
export interface ActiveRequest {
  controller: AbortController;
  cancelReason?: string;
  createdAt: number;
  sessionId: string;
  requestType: RequestType;
}

// Pool stats interface
export interface PoolStats {
  queueSize: number;
  activeRequests: number;
  activeTypes: Record<RequestType, number>;
  activeSessions: Record<string, number>;
  maxConcurrentLimits: {
    global: number;
    perSession: number;
    perType: Record<RequestType, number>;
  };
}

// Options for request execution
export interface ExecuteOptions {
  sessionId: string;
  requestId?: string;
  requestType?: RequestType;
  priority?: number;
  [key: string]: any;
} 
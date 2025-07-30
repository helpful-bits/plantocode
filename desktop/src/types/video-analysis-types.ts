/**
 * Video Analysis Types
 * 
 * Type definitions for video analysis functionality using Google Gemini models
 */

export interface VideoAnalysisPayload {
  videoPath: string;
  prompt: string;
  model: string;
  temperature: number;
  systemPrompt?: string;
  durationMs: number;
}

export interface VideoAnalysisMetadata {
  videoPath: string;
  durationMs: number;
  prompt?: string;
}

export interface VideoAnalysisResult {
  analysis: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Video analysis job response
export interface VideoAnalysisJobResponse {
  jobId: string;
}

// Supported Gemini models for video analysis
export const GEMINI_VIDEO_MODELS = [
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
] as const;

export type GeminiVideoModel = typeof GEMINI_VIDEO_MODELS[number];

// Default video analysis settings
export const DEFAULT_VIDEO_ANALYSIS_SETTINGS = {
  model: "google/gemini-2.5-pro" as GeminiVideoModel,
  temperature: 0.4,
  maxTokens: 16384,
} as const;

// Video analysis job result (alias for VideoAnalysisResult for consistency)
export interface VideoAnalysisJobResult {
  analysis: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Video analysis error types
export interface VideoAnalysisError {
  code: "RECORDING_FAILED" | "ANALYSIS_FAILED" | "INVALID_VIDEO" | "MODEL_ERROR";
  message: string;
  details?: unknown;
}
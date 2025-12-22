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
  framerate: number;
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
  "google/gemini-3-flash-preview",
] as const;

export type GeminiVideoModel = typeof GEMINI_VIDEO_MODELS[number];

// FPS policy constants
export const VIDEO_ANALYSIS_MIN_FPS = 0.1;
export const VIDEO_ANALYSIS_MAX_FPS = 20;
export const VIDEO_ANALYSIS_FPS_STEP = 0.1;

// Default video analysis settings
export const DEFAULT_VIDEO_ANALYSIS_SETTINGS = {
  model: "google/gemini-2.5-pro" as GeminiVideoModel,
  temperature: 0.4,
  maxTokens: 16384,
} as const;

// Chunk metadata type (for long video results)
export interface VideoAnalysisChunkMeta {
  index: number;
  startMs: number;
  endMs: number;
  filename: string;
}

// Video analysis job result (alias for VideoAnalysisResult for consistency)
export interface VideoAnalysisJobResult {
  analysis: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  chunks?: VideoAnalysisChunkMeta[];
}

// Video analysis error types
export interface VideoAnalysisError {
  code: "RECORDING_FAILED" | "ANALYSIS_FAILED" | "INVALID_VIDEO" | "MODEL_ERROR";
  message: string;
  details?: unknown;
}
/**
 * Action related types
 * These types represent the structures used for actions and task types
 */

// Action state structure for all server actions
export type ActionState<TData = unknown> = {
  isSuccess: boolean;
  message?: string; // Keep message optional
  data?: TData;
  error?: Error;
  metadata?: Record<string, unknown>;
  clipboardFeedback?: boolean; // Indicates that clipboard feedback should be shown in the UI
};

// Type for task types
export type TaskType =
  | "implementation_plan"
  | "path_finder"
  | "text_improvement"
  | "voice_transcription"
  | "voice_correction"
  | "path_correction"
  | "regex_generation"
  | "guidance_generation"
  | "read_directory"
  | "task_enhancement"
  | "generate_directory_tree"
  | "text_correction_post_transcription"
  | "generic_llm_stream"
  | "unknown";

// Type for task-specific settings stored in the task_settings JSON column
export type TaskSettings = {
  // Convert snake_case task types to camelCase for UI access
  pathFinder?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  voiceTranscription?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  regexGeneration?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  pathCorrection?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  textImprovement?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  voiceCorrection?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  taskEnhancement?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  guidanceGeneration?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  implementationPlan?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  genericLlmStream?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  streaming?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
  unknown?: {
    model: string;
    maxTokens: number;
    temperature: number;
  };
};

// File info type
export type FileInfo = {
  path: string;
  size?: number;
  included: boolean;
  forceExcluded: boolean;
  comparablePath: string; // Required to match the project-file-list.ts definition
};

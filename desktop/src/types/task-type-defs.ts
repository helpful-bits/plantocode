/**
 * Consolidated Task Type Definitions and Validation
 * 
 * Single source of truth for all TaskType related definitions, validation functions,
 * and metadata. This file consolidates definitions from session-types.ts, system-prompts.ts,
 * task-type-validation.ts, and task-model-settings.tsx.
 */

// Base TaskType string union (synced with Rust TaskType enum)
export type TaskType =
  | "implementation_plan"
  | "path_finder" 
  | "voice_transcription"
  | "text_improvement"
  | "path_correction"
  | "task_refinement"
  | "generic_llm_stream"
  | "regex_file_filter"
  | "file_finder_workflow"
  | "streaming"
  // New orchestrated workflow stage types
  | "local_file_filtering"
  | "file_relevance_assessment"
  | "extended_path_finder"
  | "unknown";

// Task types that support system prompts (LLM tasks only)
export type TaskTypeSupportingSystemPrompts =
  | "path_finder"
  | "voice_transcription"
  | "text_improvement"
  | "implementation_plan"
  | "path_correction"
  | "task_refinement"
  | "regex_file_filter"
  | "generic_llm_stream"
  | "extended_path_finder"
  | "file_relevance_assessment";

// Runtime array of all task types (synced with Rust TaskType enum)
export const ALL_TASK_TYPES: readonly TaskType[] = [
  "implementation_plan",
  "path_finder",
  "voice_transcription",
  "text_improvement",
  "path_correction",
  "task_refinement",
  "generic_llm_stream",
  "regex_file_filter",
  "file_finder_workflow",
  "streaming",
  "local_file_filtering",
  "file_relevance_assessment",
  "extended_path_finder",
  "unknown",
] as const;

// Runtime array of system prompt supporting task types (LLM tasks only)
export const SYSTEM_PROMPT_TASK_TYPES: readonly TaskTypeSupportingSystemPrompts[] = [
  "path_finder",
  "voice_transcription",
  "text_improvement",
  "implementation_plan",
  "path_correction",
  "task_refinement",
  "regex_file_filter",
  "generic_llm_stream",
  "extended_path_finder",
  "file_relevance_assessment",
] as const;

// Validation functions
export const validateTaskType = (task: string): task is TaskType =>
  ALL_TASK_TYPES.includes(task as TaskType);

export const supportsSystemPrompts = (task: TaskType): task is TaskTypeSupportingSystemPrompts =>
  SYSTEM_PROMPT_TASK_TYPES.includes(task as TaskTypeSupportingSystemPrompts);

export const validateSystemPromptTaskType = (task: string): task is TaskTypeSupportingSystemPrompts =>
  SYSTEM_PROMPT_TASK_TYPES.includes(task as TaskTypeSupportingSystemPrompts);

// Task types that do NOT support system prompts
export const NON_SYSTEM_PROMPT_TASK_TYPES = ALL_TASK_TYPES.filter(
  (task) => !SYSTEM_PROMPT_TASK_TYPES.includes(task as TaskTypeSupportingSystemPrompts)
) as readonly Exclude<TaskType, TaskTypeSupportingSystemPrompts>[];

// TaskTypeDetails map with comprehensive metadata
export const TaskTypeDetails: Record<TaskType, { 
  requiresLlm: boolean; 
  displayName: string; 
  category?: string;
  description?: string;
  hidden?: boolean;
  defaultProvider?: "google" | "anthropic" | "openai" | "deepseek" | "replicate";
  apiType?: "llm" | "filesystem" | "local";
  systemPromptId?: string | null;
}> = {
  // Core AI tasks
  implementation_plan: { 
    requiresLlm: true, 
    displayName: "Implementation Plans", 
    category: "Development",
    description: "Create detailed implementation plans for features",
    defaultProvider: "google"
  },
  path_finder: { 
    requiresLlm: true, 
    displayName: "File Finder", 
    category: "Code Analysis",
    description: "AI model used to find relevant files in your project",
    defaultProvider: "google"
  },
  voice_transcription: { 
    requiresLlm: true, 
    displayName: "Voice Transcription", 
    category: "Audio Processing",
    description: "Convert speech to text using batch transcription with configurable parameters",
    apiType: "llm",
    defaultProvider: "openai"
  },
  text_improvement: { 
    requiresLlm: true, 
    displayName: "Text Improvement", 
    category: "Text Processing",
    description: "Improve and enhance text for accuracy and clarity",
    defaultProvider: "anthropic"
  },
  path_correction: { 
    requiresLlm: true, 
    displayName: "Path Correction", 
    category: "Code Analysis",
    description: "Automatically correct and improve file paths",
    defaultProvider: "google"
  },
  task_refinement: { 
    requiresLlm: true, 
    displayName: "Task Refinement", 
    category: "Development",
    description: "Refine and improve task descriptions with better clarity and specificity",
    defaultProvider: "google"
  },
  generic_llm_stream: { 
    requiresLlm: true, 
    displayName: "Generic LLM Stream", 
    category: "General",
    hidden: true,
    defaultProvider: "google"
  },
  regex_file_filter: { 
    requiresLlm: true, 
    displayName: "Regex File Filter", 
    category: "Workflow Stage",
    description: "Generate regex patterns and filter relevant files",
    defaultProvider: "anthropic"
  },
  file_finder_workflow: { 
    requiresLlm: false, 
    displayName: "File Finder Workflow", 
    category: "Workflow",
    description: "Advanced file finding workflow with multiple steps",
    apiType: "filesystem"
  },
  streaming: { 
    requiresLlm: true, 
    displayName: "Streaming", 
    category: "General",
    hidden: true,
    defaultProvider: "google"
  },
  
  // Workflow stage tasks (non-LLM)
  local_file_filtering: { 
    requiresLlm: false, 
    displayName: "Local File Filtering", 
    category: "Workflow Stage",
    description: "Local file filtering and search operations",
    hidden: true,
    apiType: "filesystem"
  },
  file_relevance_assessment: { 
    requiresLlm: true, 
    displayName: "AI File Relevance Assessment", 
    category: "Workflow Stage",
    description: "Uses AI to assess relevance of filtered files before extended path finding",
    defaultProvider: "google"
  },
  extended_path_finder: { 
    requiresLlm: true, 
    displayName: "Extended Path Finder", 
    category: "Workflow Stage",
    description: "Comprehensive file discovery with deeper analysis",
    defaultProvider: "google"
  },
  
  // Fallback
  unknown: { 
    requiresLlm: true, 
    displayName: "Unknown Task", 
    category: "General",
    description: "Default settings for unspecified tasks",
    hidden: true,
    defaultProvider: "google"
  },
};

// Utility to get user-friendly error messages for invalid task types
export const getTaskTypeValidationError = (
  task: string,
  expectedType: "all" | "system-prompt" = "all"
): string => {
  if (expectedType === "system-prompt") {
    if (!validateSystemPromptTaskType(task)) {
      return `Invalid system prompt task type: "${task}". Valid types: ${SYSTEM_PROMPT_TASK_TYPES.join(", ")}`;
    }
  } else {
    if (!validateTaskType(task)) {
      return `Invalid task type: "${task}". Valid types: ${ALL_TASK_TYPES.join(", ")}`;
    }
  }
  return "";
};

// Job status constants (from session-types.ts)
export type JobStatus =
  | "idle"
  | "created"
  | "queued"
  | "acknowledgedByWorker"
  | "preparing"
  | "preparingInput"
  | "generatingStream"
  | "processingStream"
  | "running"
  | "completedByTag"
  | "completed"
  | "failed"
  | "canceled";

export const JOB_STATUSES = {
  ACTIVE: [
    "idle",
    "created",
    "queued",
    "acknowledgedByWorker",
    "preparing",
    "preparingInput",
    "generatingStream",
    "processingStream",
    "running",
  ] as JobStatus[],
  TERMINAL: [
    "completed",
    "failed",
    "canceled",
    "completedByTag",
  ] as JobStatus[],
  COMPLETED: ["completed", "completedByTag"] as JobStatus[],
  FAILED: ["failed", "canceled"] as JobStatus[],
  ALL: [
    "idle",
    "created",
    "queued",
    "acknowledgedByWorker",
    "preparing",
    "preparingInput",
    "generatingStream",
    "processingStream",
    "running",
    "completedByTag",
    "completed",
    "failed",
    "canceled",
  ] as JobStatus[],
};

// Transcription Configuration and Validation
export interface TranscriptionConfiguration {
  defaultLanguage?: string | null;
  defaultPrompt?: string | null;
  defaultTemperature?: number | null;
  model?: string | null;
}

// Supported language codes for transcription (ISO 639-1 format with common extensions)
export const SUPPORTED_TRANSCRIPTION_LANGUAGES = [
  "en", // English
  "es", // Spanish
  "fr", // French
  "de", // German
  "it", // Italian
  "pt", // Portuguese
  "ru", // Russian
  "ja", // Japanese
  "ko", // Korean
  "zh", // Chinese
  "zh-cn", // Chinese (Simplified)
  "zh-tw", // Chinese (Traditional)
  "ar", // Arabic
  "hi", // Hindi
  "nl", // Dutch
  "pl", // Polish
  "sv", // Swedish
  "da", // Danish
  "no", // Norwegian
  "fi", // Finnish
  "tr", // Turkish
  "he", // Hebrew
  "th", // Thai
  "vi", // Vietnamese
  "uk", // Ukrainian
  "cs", // Czech
  "hu", // Hungarian
  "ro", // Romanian
  "bg", // Bulgarian
  "hr", // Croatian
  "sk", // Slovak
  "sl", // Slovenian
  "et", // Estonian
  "lv", // Latvian
  "lt", // Lithuanian
] as const;

export type SupportedTranscriptionLanguage = typeof SUPPORTED_TRANSCRIPTION_LANGUAGES[number];

// Validation functions for transcription parameters
export const validateTranscriptionLanguage = (language: string): boolean => {
  if (!language) return true; // Optional parameter
  return SUPPORTED_TRANSCRIPTION_LANGUAGES.includes(language as SupportedTranscriptionLanguage) ||
         /^[a-z]{2}(-[a-z]{2})?$/i.test(language); // Basic language code format
};

export const validateTranscriptionTemperature = (temperature: number): boolean => {
  return temperature >= 0.0 && temperature <= 1.0;
};

export const validateTranscriptionPrompt = (prompt: string): boolean => {
  if (!prompt) return true; // Optional parameter
  return prompt.trim().length <= 1000; // Max 1000 characters
};

// Transcription parameter validation utility
export const validateTranscriptionParameters = (params: {
  language?: string;
  prompt?: string;
  temperature?: number;
}): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (params.language && !validateTranscriptionLanguage(params.language)) {
    errors.push(`Invalid language code: ${params.language}. Use ISO 639-1 format (e.g., 'en', 'es', 'zh-cn')`);
  }
  
  if (params.temperature !== undefined && !validateTranscriptionTemperature(params.temperature)) {
    errors.push(`Temperature must be between 0.0 and 1.0, got: ${params.temperature}`);
  }
  
  if (params.prompt && !validateTranscriptionPrompt(params.prompt)) {
    errors.push('Prompt must be 1000 characters or less');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Default transcription configuration
export const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionConfiguration = {
  defaultLanguage: null, // Auto-detect
  defaultPrompt: null, // No custom prompt
  defaultTemperature: 0.7, // Balanced creativity vs consistency
  model: null, // Use default model
};

// Language display names for UI
export const TRANSCRIPTION_LANGUAGE_DISPLAY: Record<string, string> = {
  "en": "English",
  "es": "Spanish",
  "fr": "French",
  "de": "German",
  "it": "Italian",
  "pt": "Portuguese",
  "ru": "Russian",
  "ja": "Japanese",
  "ko": "Korean",
  "zh": "Chinese",
  "zh-cn": "Chinese (Simplified)",
  "zh-tw": "Chinese (Traditional)",
  "ar": "Arabic",
  "hi": "Hindi",
  "nl": "Dutch",
  "pl": "Polish",
  "sv": "Swedish",
  "da": "Danish",
  "no": "Norwegian",
  "fi": "Finnish",
  "tr": "Turkish",
  "he": "Hebrew",
  "th": "Thai",
  "vi": "Vietnamese",
  "uk": "Ukrainian",
  "cs": "Czech",
  "hu": "Hungarian",
  "ro": "Romanian",
  "bg": "Bulgarian",
  "hr": "Croatian",
  "sk": "Slovak",
  "sl": "Slovenian",
  "et": "Estonian",
  "lv": "Latvian",
  "lt": "Lithuanian",
};

// Get display name for language code
export const getTranscriptionLanguageDisplayName = (languageCode: string): string => {
  return TRANSCRIPTION_LANGUAGE_DISPLAY[languageCode] || languageCode.toUpperCase();
};
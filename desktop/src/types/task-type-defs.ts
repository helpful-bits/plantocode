/**
 * Consolidated Task Type Definitions and Validation
 * 
 * Single source of truth for all TaskType related definitions, validation functions,
 * and metadata. This file consolidates definitions from session-types.ts, system-prompts.ts,
 * task-type-validation.ts, and task-model-settings.tsx.
 */

// Base TaskType string union
export type TaskType =
  | "implementation_plan"
  | "path_finder" 
  | "text_improvement"
  | "voice_transcription"
  | "text_correction"
  | "path_correction"
  | "guidance_generation"
  | "task_enhancement"
  | "generic_llm_stream"
  | "regex_summary_generation"
  | "regex_pattern_generation"
  | "file_finder_workflow"
  | "streaming"
  // New orchestrated workflow stage types
  | "local_file_filtering"
  | "file_relevance_assessment"
  | "extended_path_finder"
  | "extended_path_correction"
  | "server_proxy_transcription"
  | "unknown";

// Task types that support system prompts
export type TaskTypeSupportingSystemPrompts =
  | "path_finder"
  | "text_improvement"
  | "guidance_generation"
  | "text_correction"
  | "implementation_plan"
  | "path_correction"
  | "task_enhancement"
  | "regex_pattern_generation"
  | "regex_summary_generation"
  | "generic_llm_stream"
  | "extended_path_finder"
  | "extended_path_correction"
  | "file_relevance_assessment";

// Runtime array of all task types
export const ALL_TASK_TYPES: readonly TaskType[] = [
  "implementation_plan",
  "path_finder",
  "text_improvement",
  "voice_transcription",
  "text_correction",
  "path_correction",
  "guidance_generation",
  "task_enhancement",
  "generic_llm_stream",
  "regex_summary_generation",
  "regex_pattern_generation",
  "file_finder_workflow",
  "streaming",
  "local_file_filtering",
  "file_relevance_assessment",
  "extended_path_finder",
  "extended_path_correction",
  "server_proxy_transcription",
  "unknown",
] as const;

// Runtime array of system prompt supporting task types
export const SYSTEM_PROMPT_TASK_TYPES: readonly TaskTypeSupportingSystemPrompts[] = [
  "path_finder",
  "text_improvement",
  "guidance_generation",
  "text_correction",
  "implementation_plan",
  "path_correction",
  "task_enhancement",
  "regex_pattern_generation",
  "regex_summary_generation",
  "generic_llm_stream",
  "extended_path_finder",
  "extended_path_correction",
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
  defaultProvider?: "google" | "anthropic" | "openai" | "deepseek" | "groq";
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
  text_improvement: { 
    requiresLlm: true, 
    displayName: "Text Improvement", 
    category: "Text Processing",
    description: "Enhance and refine text using AI",
    defaultProvider: "anthropic"
  },
  voice_transcription: { 
    requiresLlm: true, 
    displayName: "Voice Transcription", 
    category: "Audio Processing",
    description: "Convert speech to text using AI transcription",
    defaultProvider: "openai"
  },
  text_correction: { 
    requiresLlm: true, 
    displayName: "Text Correction", 
    category: "Text Processing",
    description: "Correct and improve text for accuracy and clarity",
    defaultProvider: "anthropic"
  },
  path_correction: { 
    requiresLlm: true, 
    displayName: "Path Correction", 
    category: "Code Analysis",
    description: "Automatically correct and improve file paths",
    defaultProvider: "google"
  },
  guidance_generation: { 
    requiresLlm: true, 
    displayName: "AI Guidance", 
    category: "Development",
    description: "Generate contextual guidance for your tasks",
    defaultProvider: "google"
  },
  task_enhancement: { 
    requiresLlm: true, 
    displayName: "Task Enhancement", 
    category: "General",
    hidden: true,
    defaultProvider: "google"
  },
  generic_llm_stream: { 
    requiresLlm: true, 
    displayName: "Generic LLM Stream", 
    category: "General",
    hidden: true,
    defaultProvider: "google"
  },
  regex_summary_generation: { 
    requiresLlm: true, 
    displayName: "Regex Summary Generation", 
    category: "Pattern Matching",
    hidden: true,
    defaultProvider: "anthropic"
  },
  regex_pattern_generation: { 
    requiresLlm: true, 
    displayName: "Regex Pattern Generation", 
    category: "Workflow Stage",
    description: "Generate regex patterns to filter relevant files",
    defaultProvider: "anthropic"
  },
  file_finder_workflow: { 
    requiresLlm: false, 
    displayName: "File Finder Workflow", 
    category: "Workflow",
    description: "Advanced file finding workflow with multiple steps",
    apiType: "filesystem",
    systemPromptId: null
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
    defaultProvider: "google"
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
  extended_path_correction: { 
    requiresLlm: true, 
    displayName: "Extended Path Correction", 
    category: "Workflow Stage",
    description: "Final validation and correction of discovered files",
    defaultProvider: "google"
  },
  server_proxy_transcription: { 
    requiresLlm: true, 
    displayName: "Server Proxy Transcription", 
    category: "Audio Processing",
    description: "Server-based transcription processing",
    hidden: true,
    defaultProvider: "groq"
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
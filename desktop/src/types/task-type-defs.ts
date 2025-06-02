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
  | "server_proxy_transcription"
  | "streaming"
  // New orchestrated workflow stage types
  | "directory_tree_generation"
  | "local_file_filtering"
  | "extended_path_finder"
  | "extended_path_correction"
  | "initial_path_finding"
  | "extended_path_finding" // Duplicate of extended_path_finder - kept for compatibility
  | "initial_path_correction"
  | "regex_generation" // Duplicate of regex_pattern_generation - kept for compatibility
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
  | "generic_llm_stream";

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
  "server_proxy_transcription",
  "streaming",
  "directory_tree_generation",
  "local_file_filtering",
  "extended_path_finder",
  "extended_path_correction",
  "initial_path_finding",
  "extended_path_finding",
  "initial_path_correction",
  "regex_generation",
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
  defaultProvider?: "google" | "anthropic" | "openai" | "deepseek";
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
    category: "Pattern Matching",
    hidden: true,
    defaultProvider: "anthropic"
  },
  regex_generation: { 
    requiresLlm: true, 
    displayName: "Regex Generation", 
    category: "Pattern Matching",
    hidden: true,
    defaultProvider: "anthropic"
  },
  file_finder_workflow: { 
    requiresLlm: false, 
    displayName: "File Finder Workflow", 
    category: "Workflow",
    description: "Advanced file finding workflow with multiple steps",
    defaultProvider: "google"
  },
  server_proxy_transcription: { 
    requiresLlm: true, 
    displayName: "Server Proxy Transcription", 
    category: "Audio Processing",
    hidden: true,
    defaultProvider: "openai"
  },
  streaming: { 
    requiresLlm: true, 
    displayName: "Streaming", 
    category: "General",
    hidden: true,
    defaultProvider: "google"
  },
  
  // Workflow stage tasks (non-LLM)
  directory_tree_generation: { 
    requiresLlm: false, 
    displayName: "Directory Tree Generation", 
    category: "Workflow Stage",
    description: "Generate directory tree structure for projects",
    hidden: true,
    defaultProvider: "google"
  },
  local_file_filtering: { 
    requiresLlm: false, 
    displayName: "Local File Filtering", 
    category: "Workflow Stage",
    description: "Local file filtering and search operations",
    hidden: true,
    defaultProvider: "google"
  },
  extended_path_finder: { 
    requiresLlm: true, 
    displayName: "Extended Path Finder", 
    category: "Workflow Stage",
    description: "Extended path finding capabilities",
    hidden: true,
    defaultProvider: "google"
  },
  extended_path_correction: { 
    requiresLlm: true, 
    displayName: "Extended Path Correction", 
    category: "Workflow Stage",
    description: "Extended path correction capabilities",
    hidden: true,
    defaultProvider: "google"
  },
  initial_path_finding: { 
    requiresLlm: true, 
    displayName: "Initial Path Finding", 
    category: "Workflow Stage",
    description: "Initial path finding stage of workflow",
    hidden: true,
    defaultProvider: "google"
  },
  extended_path_finding: { 
    requiresLlm: true, 
    displayName: "Extended Path Finding", 
    category: "Workflow Stage",
    description: "Extended path finding stage of workflow", 
    hidden: true,
    defaultProvider: "google"
  },
  initial_path_correction: { 
    requiresLlm: true, 
    displayName: "Initial Path Correction", 
    category: "Workflow Stage",
    description: "Initial path correction stage of workflow",
    hidden: true,
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
  | "preparing"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "created"
  | "queued"
  | "acknowledged_by_worker"
  | "preparing_input"
  | "generating_stream"
  | "processing_stream"
  | "completed_by_tag";

export const JOB_STATUSES = {
  ACTIVE: [
    "idle",
    "preparing",
    "running",
    "queued",
    "created",
    "acknowledged_by_worker",
    "preparing_input",
    "generating_stream",
    "processing_stream",
  ] as JobStatus[],
  TERMINAL: [
    "completed",
    "failed",
    "canceled",
    "completed_by_tag",
  ] as JobStatus[],
  COMPLETED: ["completed", "completed_by_tag"] as JobStatus[],
  FAILED: ["failed", "canceled"] as JobStatus[],
  ALL: [
    "idle",
    "preparing",
    "running",
    "queued",
    "created",
    "completed",
    "failed",
    "canceled",
    "acknowledged_by_worker",
    "preparing_input",
    "generating_stream",
    "processing_stream",
    "completed_by_tag",
  ] as JobStatus[],
};
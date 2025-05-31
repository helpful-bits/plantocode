/**
 * Task Type Validation and Constants
 * 
 * This file provides validation and constants for task types to prevent
 * confusion between different TaskType definitions and ensure type safety.
 */

import type { TaskType } from "./session-types";
import type { TaskTypeSupportingSystemPrompts } from "./system-prompts";


/**
 * All task types supported by the application (runtime array)
 */
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
  
  // New orchestrated workflow stage types
  "directory_tree_generation",
  "local_file_filtering",
  "extended_path_finder",
  "extended_path_correction",
  
  "unknown",
] as const;

/**
 * Task types that support system prompts (runtime array)
 */
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

/**
 * Runtime validation for TaskType
 */
export const validateTaskType = (task: string): task is TaskType => {
  return ALL_TASK_TYPES.includes(task as TaskType);
};

/**
 * Runtime validation for TaskTypeSupportingSystemPrompts
 */
export const validateSystemPromptTaskType = (task: string): task is TaskTypeSupportingSystemPrompts => {
  return SYSTEM_PROMPT_TASK_TYPES.includes(task as TaskTypeSupportingSystemPrompts);
};

/**
 * Check if a task type supports system prompts
 */
export const supportsSystemPrompts = (task: TaskType): task is TaskTypeSupportingSystemPrompts => {
  return SYSTEM_PROMPT_TASK_TYPES.includes(task as TaskTypeSupportingSystemPrompts);
};

/**
 * Task types that do NOT support system prompts
 */
export const NON_SYSTEM_PROMPT_TASK_TYPES = ALL_TASK_TYPES.filter(
  (task) => !SYSTEM_PROMPT_TASK_TYPES.includes(task as TaskTypeSupportingSystemPrompts)
) as readonly Exclude<TaskType, TaskTypeSupportingSystemPrompts>[];

/**
 * Utility to get user-friendly error messages for invalid task types
 */
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
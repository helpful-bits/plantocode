/**
 * Strict TaskType validation utilities
 * NO FALLBACKS - ALL VALIDATION FAILURES ARE FATAL
 */

import { TaskType, TaskTypeDetails, ALL_TASK_TYPES } from '@/types/task-type-defs';

/**
 * Strictly validate a task type string
 * THROWS on invalid task types - NO FALLBACKS
 */
export function validateTaskType(taskType: string): TaskType {
  if (!taskType) {
    throw new Error('TaskType cannot be null, undefined, or empty');
  }

  if (typeof taskType !== 'string') {
    throw new Error(`TaskType must be a string, received: ${typeof taskType}`);
  }

  const trimmedTaskType = taskType.trim();
  if (trimmedTaskType === '') {
    throw new Error('TaskType cannot be empty or whitespace');
  }

  // STRICT: TaskType MUST be in the allowed list
  if (!ALL_TASK_TYPES.includes(trimmedTaskType as TaskType)) {
    throw new Error(
      `Invalid task type '${trimmedTaskType}'. Valid task types are: ${ALL_TASK_TYPES.join(', ')}`
    );
  }

  return trimmedTaskType as TaskType;
}

/**
 * Strictly validate a task type and ensure it has complete configuration
 * THROWS on missing or incomplete configuration - NO FALLBACKS
 */
export function validateTaskTypeWithConfiguration(taskType: string): TaskType {
  const validatedTaskType = validateTaskType(taskType);
  
  // STRICT: TaskType MUST exist in TaskTypeDetails
  const taskDetails = TaskTypeDetails[validatedTaskType];
  if (!taskDetails) {
    throw new Error(
      `Task type '${validatedTaskType}' is not configured in TaskTypeDetails. This indicates a system configuration error.`
    );
  }

  // STRICT: TaskType MUST have displayName
  if (!taskDetails.displayName) {
    throw new Error(
      `Task type '${validatedTaskType}' is missing displayName in TaskTypeDetails. This indicates a system configuration error.`
    );
  }

  // STRICT: TaskType MUST have requiresLlm field
  if (taskDetails.requiresLlm === undefined || taskDetails.requiresLlm === null) {
    throw new Error(
      `Task type '${validatedTaskType}' is missing requiresLlm configuration in TaskTypeDetails. This indicates a system configuration error.`
    );
  }

  return validatedTaskType;
}

/**
 * Validate that a task type requires LLM configuration
 * THROWS if task type doesn't require LLM or is invalid - NO FALLBACKS
 */
export function validateLlmTaskType(taskType: string): TaskType {
  const validatedTaskType = validateTaskTypeWithConfiguration(taskType);
  
  const taskDetails = TaskTypeDetails[validatedTaskType];
  if (!taskDetails.requiresLlm) {
    throw new Error(
      `Task type '${validatedTaskType}' does not require LLM configuration. This task is a local filesystem operation.`
    );
  }

  return validatedTaskType;
}

/**
 * Validate that a task type is for local filesystem operations
 * THROWS if task type requires LLM or is invalid - NO FALLBACKS
 */
export function validateLocalTaskType(taskType: string): TaskType {
  const validatedTaskType = validateTaskTypeWithConfiguration(taskType);
  
  const taskDetails = TaskTypeDetails[validatedTaskType];
  if (taskDetails.requiresLlm) {
    throw new Error(
      `Task type '${validatedTaskType}' requires LLM configuration. This task is not a local filesystem operation.`
    );
  }

  return validatedTaskType;
}

/**
 * Get task type configuration with strict validation
 * THROWS on missing or invalid configuration - NO FALLBACKS
 */
export function getTaskTypeConfiguration(taskType: string) {
  const validatedTaskType = validateTaskTypeWithConfiguration(taskType);
  return TaskTypeDetails[validatedTaskType];
}

/**
 * Validate an array of task types
 * THROWS on any invalid task type - NO FALLBACKS
 */
export function validateTaskTypes(taskTypes: string[]): TaskType[] {
  if (!Array.isArray(taskTypes)) {
    throw new Error('TaskTypes must be an array');
  }

  if (taskTypes.length === 0) {
    throw new Error('TaskTypes array cannot be empty');
  }

  return taskTypes.map(taskType => validateTaskType(taskType));
}

/**
 * Get detailed error message for invalid task type
 */
export function getTaskTypeValidationError(taskType: string, context?: string): string {
  const contextPrefix = context ? `${context}: ` : '';
  
  if (!taskType) {
    return `${contextPrefix}TaskType is required and cannot be null, undefined, or empty`;
  }

  if (typeof taskType !== 'string') {
    return `${contextPrefix}TaskType must be a string, received: ${typeof taskType}`;
  }

  const trimmedTaskType = taskType.trim();
  if (trimmedTaskType === '') {
    return `${contextPrefix}TaskType cannot be empty or whitespace`;
  }

  if (!ALL_TASK_TYPES.includes(trimmedTaskType as TaskType)) {
    return `${contextPrefix}Invalid task type '${trimmedTaskType}'. Valid task types are: ${ALL_TASK_TYPES.join(', ')}`;
  }

  const taskDetails = TaskTypeDetails[trimmedTaskType as TaskType];
  if (!taskDetails) {
    return `${contextPrefix}Task type '${trimmedTaskType}' is not configured in TaskTypeDetails`;
  }

  if (!taskDetails.displayName) {
    return `${contextPrefix}Task type '${trimmedTaskType}' is missing displayName in TaskTypeDetails`;
  }

  return `${contextPrefix}Task type '${trimmedTaskType}' is valid`;
}

/**
 * Check if a task type is valid without throwing
 */
export function isValidTaskType(taskType: string): boolean {
  try {
    validateTaskType(taskType);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a task type is valid and has complete configuration without throwing
 */
export function isValidTaskTypeWithConfiguration(taskType: string): boolean {
  try {
    validateTaskTypeWithConfiguration(taskType);
    return true;
  } catch {
    return false;
  }
}
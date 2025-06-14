import { invoke } from '@tauri-apps/api/core';
import { TaskType } from '../types/task-type-defs';
import type { DefaultSystemPrompt } from '../types/system-prompts';

/**
 * Get system prompt for a task type at project level
 */
export async function getProjectSystemPrompt(
  projectDirectory: string,
  taskType: TaskType
): Promise<string | null> {
  try {
    const response = await invoke<string | null>('get_project_system_prompt_command', {
      projectDirectory,
      taskType
    });
    return response;
  } catch (error) {
    console.error('Failed to get project system prompt:', error);
    throw error;
  }
}

/**
 * Set system prompt for a task type at project level
 */
export async function setProjectSystemPrompt(
  projectDirectory: string,
  taskType: TaskType,
  systemPrompt: string
): Promise<void> {
  try {
    await invoke<void>('set_project_system_prompt_command', {
      projectDirectory,
      taskType,
      systemPrompt
    });
  } catch (error) {
    console.error('Failed to set project system prompt:', error);
    throw error;
  }
}

/**
 * Reset system prompt to default for a task type at project level
 */
export async function resetProjectSystemPrompt(
  projectDirectory: string,
  taskType: TaskType
): Promise<void> {
  try {
    await invoke<void>('reset_project_system_prompt_command', {
      projectDirectory,
      taskType
    });
  } catch (error) {
    console.error('Failed to reset project system prompt:', error);
    throw error;
  }
}

/**
 * Validate system prompt content
 */
export function validateSystemPrompt(prompt: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (prompt.length > 10000) {
    errors.push('System prompt is too long (maximum 10,000 characters)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Extract placeholders from a system prompt template
 */
export function extractPlaceholders(template: string): string[] {
  const placeholderRegex = /\{\{([A-Z_]+)\}\}/g;
  const placeholders: string[] = [];
  let match;
  
  while ((match = placeholderRegex.exec(template)) !== null) {
    if (!placeholders.includes(match[1])) {
      placeholders.push(match[1]);
    }
  }
  
  return placeholders;
}

/**
 * Fetch all default system prompts from the server
 */
export async function getDefaultSystemPrompts(): Promise<DefaultSystemPrompt[]> {
  try {
    const response = await invoke<DefaultSystemPrompt[]>('fetch_default_system_prompts_from_server');
    return response;
  } catch (error) {
    console.error('Failed to fetch default system prompts:', error);
    throw error;
  }
}

/**
 * Fetch a specific default system prompt from the server by task type
 */
export async function getDefaultSystemPromptByTaskType(taskType: TaskType): Promise<DefaultSystemPrompt | null> {
  try {
    const response = await invoke<DefaultSystemPrompt | null>('fetch_default_system_prompt_from_server', {
      taskType
    });
    return response;
  } catch (error) {
    console.error(`Failed to fetch default system prompt for task type ${taskType}:`, error);
    throw error;
  }
}
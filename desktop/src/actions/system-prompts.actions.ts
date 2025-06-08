import { invoke } from '@tauri-apps/api/core';
import {
  SystemPromptResponse,
  DefaultSystemPrompt
} from '../types/system-prompts';
import { TaskType } from '../types/session-types';

/**
 * Get effective system prompt for a task type (custom or default)
 */
export async function getSystemPrompt(
  sessionId: string,
  taskType: TaskType
): Promise<SystemPromptResponse | null> {
  try {
    const response = await invoke<SystemPromptResponse | null>('get_system_prompt_command', {
      sessionId,
      taskType
    });
    return response;
  } catch (error) {
    console.error('Failed to get system prompt:', error);
    throw error;
  }
}

/**
 * Set custom system prompt for a task type
 */
export async function setSystemPrompt(
  sessionId: string,
  taskType: TaskType,
  systemPrompt: string
): Promise<void> {
  try {
    await invoke<void>('set_system_prompt_command', {
      sessionId,
      taskType,
      systemPrompt
    });
  } catch (error) {
    console.error('Failed to set system prompt:', error);
    throw error;
  }
}

/**
 * Reset system prompt to default for a task type
 */
export async function resetSystemPrompt(
  sessionId: string,
  taskType: TaskType
): Promise<void> {
  try {
    await invoke<void>('reset_system_prompt_command', {
      sessionId,
      taskType
    });
  } catch (error) {
    console.error('Failed to reset system prompt:', error);
    throw error;
  }
}

/**
 * Get all default system prompts from cache
 * Note: System prompts are automatically loaded from server after authentication
 */
export async function getDefaultSystemPrompts(): Promise<DefaultSystemPrompt[]> {
  try {
    const response = await invoke<DefaultSystemPrompt[]>('get_default_system_prompts_command');
    return response;
  } catch (error) {
    console.error('Failed to get default system prompts from cache:', error);
    throw new Error('System prompts not available. Please ensure you are authenticated and the application has initialized properly.');
  }
}

/**
 * Get default system prompt for a specific task type from cache
 * Note: System prompts are automatically loaded from server after authentication
 */
export async function getDefaultSystemPrompt(taskType: TaskType): Promise<DefaultSystemPrompt | null> {
  try {
    const response = await invoke<DefaultSystemPrompt | null>('get_default_system_prompt_command', {
      taskType
    });
    return response;
  } catch (error) {
    console.error('Failed to get default system prompt from cache:', error);
    throw new Error(`System prompt for task type '${taskType}' not available. Please ensure you are authenticated and the application has initialized properly.`);
  }
}

/**
 * Check if a task type has a custom system prompt
 */
export async function hasCustomSystemPrompt(
  sessionId: string,
  taskType: TaskType
): Promise<boolean> {
  try {
    const response = await invoke<boolean>('has_custom_system_prompt_command', {
      sessionId,
      taskType
    });
    return response;
  } catch (error) {
    console.error('Failed to check custom system prompt:', error);
    throw error;
  }
}

/**
 * Utility function to get system prompt template for display (with placeholders)
 */
export async function getSystemPromptTemplate(
  sessionId: string,
  taskType: TaskType
): Promise<string | null> {
  try {
    const prompt = await getSystemPrompt(sessionId, taskType);
    return prompt?.systemPrompt ?? null;
  } catch (error) {
    console.error('Failed to get system prompt template:', error);
    throw error;
  }
}

/**
 * Batch operation to get system prompts for multiple task types
 */
export async function getBatchSystemPrompts(
  sessionId: string,
  taskTypes: TaskType[]
): Promise<Record<TaskType, SystemPromptResponse | null>> {
  const results: Record<string, SystemPromptResponse | null> = {};
  
  await Promise.all(
    taskTypes.map(async (taskType) => {
      try {
        results[taskType] = await getSystemPrompt(sessionId, taskType);
      } catch (error) {
        console.error(`Failed to get system prompt for ${taskType}:`, error);
        results[taskType] = null;
      }
    })
  );
  
  return results as Record<TaskType, SystemPromptResponse | null>;
}

/**
 * Validate system prompt content
 */
export function validateSystemPrompt(prompt: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!prompt || prompt.trim().length === 0) {
    errors.push('System prompt cannot be empty');
  }
  
  if (prompt.length < 10) {
    errors.push('System prompt is too short (minimum 10 characters)');
  }
  
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
 * Update a default system prompt content and description
 * This is primarily for admin/dev use but sets up future possibilities
 */
export async function updateDefaultSystemPrompt(
  taskType: TaskType,
  newPromptContent: string,
  newDescription?: string
): Promise<void> {
  try {
    await invoke<void>('update_default_system_prompt_command', {
      taskType,
      newPromptContent,
      newDescription
    });
  } catch (error) {
    console.error('Failed to update default system prompt:', error);
    throw error;
  }
}

/**
 * Get available placeholder names with descriptions
 */
export function getAvailablePlaceholders(): Record<string, string> {
  return {
    'PROJECT_CONTEXT': 'Information about the project structure and context',
    'LANGUAGE': 'The target language for the task',
    'IMPROVEMENT_TYPE': 'Type of improvement to apply (for text improvement tasks)',
    'CUSTOM_INSTRUCTIONS': 'Additional custom instructions from the user',
    'FILE_CONTENTS': 'Contents of relevant files',
    'DIRECTORY_TREE': 'Project directory structure',
    'MODEL_NAME': 'Name of the AI model being used',
    'SESSION_NAME': 'Name of the current session',
    'TASK_TYPE': 'The type of task being performed'
  };
}
/**
 * System Prompts Actions
 *
 * Actions for managing default system prompts from the server.
 * These are the default system prompts that come from the backend
 * and are used when no project-specific prompt is set.
 */

import { invoke } from "@tauri-apps/api/core";
import type { DefaultSystemPrompt } from "@/types/system-prompts";
import type { TaskType } from "@/types/task-type-defs";

/**
 * Fetch all default system prompts from the server
 */
export async function getDefaultSystemPrompts(): Promise<DefaultSystemPrompt[]> {
  try {
    const response = await invoke<DefaultSystemPrompt[]>("fetch_default_system_prompts_from_server");
    return response;
  } catch (error) {
    console.error("Failed to fetch default system prompts:", error);
    throw error;
  }
}

/**
 * Fetch a specific default system prompt from the server by task type
 */
export async function getDefaultSystemPrompt(taskType: TaskType): Promise<DefaultSystemPrompt | null> {
  try {
    const response = await invoke<DefaultSystemPrompt | null>("fetch_default_system_prompt_from_server", {
      taskType,
    });
    return response;
  } catch (error) {
    console.error(`Failed to fetch default system prompt for task type ${taskType}:`, error);
    throw error;
  }
}

/**
 * Initialize system prompts from server
 * This command updates the local database with the latest default prompts from the server
 */
export async function initializeSystemPromptsFromServer(): Promise<void> {
  try {
    await invoke<void>("initialize_system_prompts_from_server");
  } catch (error) {
    console.error("Failed to initialize system prompts from server:", error);
    throw error;
  }
}

/**
 * Get default system prompts with error handling and fallback
 * This function provides a safe way to get default prompts with appropriate error handling
 */
export async function getDefaultSystemPromptsWithFallback(): Promise<{
  isSuccess: boolean;
  data?: DefaultSystemPrompt[];
  message?: string;
}> {
  try {
    const prompts = await getDefaultSystemPrompts();
    return {
      isSuccess: true,
      data: prompts,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to fetch default system prompts",
    };
  }
}

/**
 * Get a specific default system prompt with error handling and fallback
 */
export async function getDefaultSystemPromptWithFallback(taskType: TaskType): Promise<{
  isSuccess: boolean;
  data?: DefaultSystemPrompt;
  message?: string;
}> {
  try {
    const prompt = await getDefaultSystemPrompt(taskType);
    return {
      isSuccess: true,
      data: prompt || undefined,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : `Failed to fetch default system prompt for ${taskType}`,
    };
  }
}
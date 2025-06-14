/**
 * Configuration Actions
 *
 * Direct actions for configuration-related operations when running
 * in the desktop environment.
 */

import { invoke } from "@tauri-apps/api/core";
import { type TaskType } from "@/types/session-types";
import type {
  RuntimeAIConfig,
  TaskModelSettings,
  ProviderWithModels,
} from "@/types/config-types";
// Using Record<string, any> instead of HashMap from Tauri

/**
 * Fetch runtime AI configuration from the server
 */
export async function fetchRuntimeAIConfig(): Promise<RuntimeAIConfig> {
  return invoke("fetch_runtime_ai_config");
}

/**
 * Get providers with models
 */
export async function getProvidersWithModels(): Promise<ProviderWithModels[]> {
  return invoke("get_providers_with_models");
}


/**
 * Get default task configurations from the cached configuration
 */
export async function getDefaultTaskConfigurations(): Promise<
  Record<TaskType, TaskModelSettings>
> {
  return invoke("get_default_task_configurations");
}

/**
 * Get runtime AI configuration with action state wrapper
 */
export async function getRuntimeAIConfig(): Promise<{
  isSuccess: boolean;
  data?: RuntimeAIConfig;
  message?: string;
}> {
  try {
    const config = await fetchRuntimeAIConfig();
    return {
      isSuccess: true,
      data: config,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to fetch runtime config",
    };
  }
}


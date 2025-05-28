/**
 * Configuration Actions
 *
 * Direct actions for configuration-related operations when running
 * in the desktop environment.
 */

import { invoke } from "@tauri-apps/api/core";
// Using Record<string, any> instead of HashMap from Tauri

/**
 * Runtime AI configuration interface
 */
export interface RuntimeAIConfig {
  defaultLlmModelId: string;
  defaultVoiceModelId: string;
  defaultTranscriptionModelId: string;
  tasks: Record<string, TaskModelSettings>;
  availableModels: ModelInfo[];
  pathFinderSettings: PathFinderSettings;
}

/**
 * Model information interface
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
  pricePerInputToken: number;
  pricePerOutputToken: number;
}

/**
 * Task-specific model configuration interface
 */
export interface TaskModelSettings {
  model: string;
  maxTokens: number;
  temperature: number;
}

/**
 * Path finder settings interface
 */
export interface PathFinderSettings {
  maxFilesWithContent?: number;
  includeFileContents?: boolean;
  maxContentSizePerFile?: number;
  maxFileCount?: number;
  fileContentTruncationChars?: number;
  contentLimitBuffer?: number;
}

/**
 * Fetch runtime AI configuration from the server
 */
export async function fetchRuntimeAIConfig(): Promise<RuntimeAIConfig> {
  return invoke("fetch_runtime_ai_config");
}

/**
 * Get available AI models from the cached configuration
 */
export async function getAvailableAIModels(): Promise<ModelInfo[]> {
  return invoke("get_available_ai_models");
}

/**
 * Get default task configurations from the cached configuration
 */
export async function getDefaultTaskConfigurations(): Promise<
  Record<string, TaskModelSettings>
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

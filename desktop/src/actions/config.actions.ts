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
  default_llm_model_id: string;
  default_voice_model_id: string;
  default_transcription_model_id: string;
  tasks: Record<string, TaskSpecificModelConfig>;
  available_models: ModelInfo[];
  path_finder_settings: PathFinderSettings;
  limits: TokenLimits;
}

/**
 * Model information interface
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  context_window?: number;
  price_per_input_token: number;
  price_per_output_token: number;
}

/**
 * Task-specific model configuration interface
 */
export interface TaskSpecificModelConfig {
  model: string;
  max_tokens: number;
  temperature: number;
}

/**
 * Path finder settings interface
 */
export interface PathFinderSettings {
  max_files_with_content?: number;
  include_file_contents?: boolean;
  max_content_size_per_file?: number;
  max_file_count?: number;
  file_content_truncation_chars?: number;
  token_limit_buffer?: number;
}

/**
 * Token limits interface
 */
export interface TokenLimits {
  max_tokens_per_minute?: number;
  max_tokens_per_day?: number;
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
  Record<string, TaskSpecificModelConfig>
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

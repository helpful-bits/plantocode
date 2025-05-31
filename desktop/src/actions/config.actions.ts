/**
 * Configuration Actions
 *
 * Direct actions for configuration-related operations when running
 * in the desktop environment.
 */

import { invoke } from "@tauri-apps/api/core";
import { type TaskType } from "@/types/session-types";
// Using Record<string, any> instead of HashMap from Tauri

/**
 * Runtime AI configuration interface
 * Must match the Rust backend RuntimeAIConfig struct
 */
export interface RuntimeAIConfig {
  defaultLlmModelId: string;
  defaultVoiceModelId: string;
  defaultTranscriptionModelId: string;
  tasks: Record<string, TaskModelSettings>; // Backend uses string keys, not TaskType enum
  availableModels: ModelInfo[];
  pathFinderSettings: PathFinderSettings;
  limits: TokenLimits; // Remove optional since backend uses #[serde(default)]
  maxConcurrentJobs?: number;
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
 * Must match the Rust backend TaskSpecificModelConfig struct
 */
export interface TaskModelSettings {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Path finder settings interface
 * Must match the Rust backend PathFinderSettings struct
 */
export interface PathFinderSettings {
  maxFilesWithContent?: number;
  includeFileContents?: boolean;
  maxContentSizePerFile?: number;
  maxFileCount?: number;
  fileContentTruncationChars?: number;
  tokenLimitBuffer?: number; // Backend uses tokenLimitBuffer, not contentLimitBuffer
}

/**
 * Token limits interface to match backend
 * Must match the Rust backend TokenLimits struct
 */
export interface TokenLimits {
  maxTokensPerRequest?: number;
  maxTokensPerMonth?: number;
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

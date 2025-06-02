/**
 * Configuration Types
 *
 * Shared type definitions for configuration-related interfaces
 * that are used across multiple modules.
 */


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
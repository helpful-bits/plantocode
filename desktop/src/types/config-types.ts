/**
 * Configuration Types
 *
 * Shared type definitions for configuration-related interfaces
 * that are used across multiple modules.
 */


/**
 * Provider information interface
 */
export interface ProviderInfo {
  code: string;
  name: string;
}

/**
 * Provider with models interface
 */
export interface ProviderWithModels {
  provider: ProviderInfo;
  models: ModelInfo[];
}

/**
 * Runtime AI configuration interface
 * Must match the Rust backend RuntimeAIConfig struct
 */
export interface RuntimeAIConfig {
  defaultLlmModelId: string;
  defaultVoiceModelId: string;
  defaultTranscriptionModelId: string;
  tasks: Record<string, TaskModelSettings>; // Backend uses string keys, not TaskType enum
  providers: ProviderWithModels[];
  pathFinderSettings: PathFinderSettings;
  limits: TokenLimits; // Remove optional since backend uses #[serde(default)]
  maxConcurrentJobs?: number;
  transcriptionConfig?: TranscriptionConfig;
}

/**
 * Model information interface
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  description?: string;
  contextWindow?: number;
  pricePerInputToken: number;
  pricePerOutputToken: number;
}

/**
 * Copy button configuration interface
 */
export interface CopyButtonConfig {
  id: string;
  label: string;
  content: string;
}

/**
 * Task-specific model configuration interface
 * Must match the Rust backend TaskSpecificModelConfig struct
 */
export interface TaskModelSettings {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  copyButtons?: CopyButtonConfig[];
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
 * Transcription settings interface
 * Configuration for voice transcription functionality
 */
export interface TranscriptionSettings {
  model?: string;
  language?: string;
  prompt?: string;
  temperature?: number;
  enablePersistence?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  customPrompts?: TranscriptionPromptTemplate[];
}

/**
 * Transcription prompt template interface
 * Pre-defined prompt templates for different use cases
 */
export interface TranscriptionPromptTemplate {
  id: string;
  name: string;
  description?: string;
  prompt: string;
  language?: string;
  category?: 'general' | 'technical' | 'medical' | 'legal' | 'custom';
  isDefault?: boolean;
}

/**
 * Transcription configuration interface
 * Complete transcription configuration structure
 */
export interface TranscriptionConfig {
  settings: TranscriptionSettings;
  templates: TranscriptionPromptTemplate[];
  userPreferences: TranscriptionUserPreferences;
}

/**
 * User preferences for transcription
 * User-specific transcription preferences and settings
 */
export interface TranscriptionUserPreferences {
  defaultLanguage?: string;
  defaultModel?: string;
  preferredPromptTemplateId?: string;
  autoSaveTranscriptions?: boolean;
  enableAdvancedSettings?: boolean;
  customSettings?: Record<string, any>;
}
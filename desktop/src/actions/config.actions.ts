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
  ModelInfo,
  TaskModelSettings,
  TranscriptionConfig,
  TranscriptionSettings,
  TranscriptionPromptTemplate,
  TranscriptionUserPreferences,
} from "@/types/config-types";
// Using Record<string, any> instead of HashMap from Tauri

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

// Re-export ModelInfo for convenience
export type { ModelInfo } from "@/types/config-types";

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

// ================================
// Transcription Configuration Actions
// ================================

/**
 * Get transcription configuration
 */
export async function getTranscriptionConfig(): Promise<{
  isSuccess: boolean;
  data?: TranscriptionConfig;
  message?: string;
}> {
  try {
    const config = await invoke<TranscriptionConfig>("get_transcription_config");
    return {
      isSuccess: true,
      data: config,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to fetch transcription config",
    };
  }
}

/**
 * Get transcription settings only
 */
export async function getTranscriptionSettings(): Promise<{
  isSuccess: boolean;
  data?: TranscriptionSettings;
  message?: string;
}> {
  try {
    const settings = await invoke<TranscriptionSettings>("get_transcription_settings");
    return {
      isSuccess: true,
      data: settings,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to fetch transcription settings",
    };
  }
}

/**
 * Set transcription settings
 */
export async function setTranscriptionSettings(
  settings: Partial<TranscriptionSettings>
): Promise<{
  isSuccess: boolean;
  message?: string;
}> {
  try {
    await invoke("set_transcription_settings", { settings });
    return {
      isSuccess: true,
      message: "Transcription settings updated successfully",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to update transcription settings",
    };
  }
}

/**
 * Reset transcription settings to defaults
 */
export async function resetTranscriptionSettings(): Promise<{
  isSuccess: boolean;
  message?: string;
}> {
  try {
    await invoke("reset_transcription_settings");
    return {
      isSuccess: true,
      message: "Transcription settings reset to defaults",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to reset transcription settings",
    };
  }
}

/**
 * Get transcription prompt templates
 */
export async function getTranscriptionPromptTemplates(): Promise<{
  isSuccess: boolean;
  data?: TranscriptionPromptTemplate[];
  message?: string;
}> {
  try {
    const templates = await invoke<TranscriptionPromptTemplate[]>("get_transcription_prompt_templates");
    return {
      isSuccess: true,
      data: templates,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to fetch prompt templates",
    };
  }
}

/**
 * Add custom transcription prompt template
 */
export async function addTranscriptionPromptTemplate(
  template: Omit<TranscriptionPromptTemplate, 'id'>
): Promise<{
  isSuccess: boolean;
  data?: TranscriptionPromptTemplate;
  message?: string;
}> {
  try {
    const newTemplate = await invoke<TranscriptionPromptTemplate>("add_transcription_prompt_template", { template });
    return {
      isSuccess: true,
      data: newTemplate,
      message: "Prompt template added successfully",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to add prompt template",
    };
  }
}

/**
 * Update transcription prompt template
 */
export async function updateTranscriptionPromptTemplate(
  templateId: string,
  updates: Partial<TranscriptionPromptTemplate>
): Promise<{
  isSuccess: boolean;
  message?: string;
}> {
  try {
    await invoke("update_transcription_prompt_template", { templateId, updates });
    return {
      isSuccess: true,
      message: "Prompt template updated successfully",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to update prompt template",
    };
  }
}

/**
 * Delete transcription prompt template
 */
export async function deleteTranscriptionPromptTemplate(
  templateId: string
): Promise<{
  isSuccess: boolean;
  message?: string;
}> {
  try {
    await invoke("delete_transcription_prompt_template", { templateId });
    return {
      isSuccess: true,
      message: "Prompt template deleted successfully",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to delete prompt template",
    };
  }
}

/**
 * Get user transcription preferences
 */
export async function getTranscriptionUserPreferences(): Promise<{
  isSuccess: boolean;
  data?: TranscriptionUserPreferences;
  message?: string;
}> {
  try {
    const preferences = await invoke<TranscriptionUserPreferences>("get_transcription_user_preferences");
    return {
      isSuccess: true,
      data: preferences,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to fetch user preferences",
    };
  }
}

/**
 * Set user transcription preferences
 */
export async function setTranscriptionUserPreferences(
  preferences: Partial<TranscriptionUserPreferences>
): Promise<{
  isSuccess: boolean;
  message?: string;
}> {
  try {
    await invoke("set_transcription_user_preferences", { preferences });
    return {
      isSuccess: true,
      message: "User preferences updated successfully",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to update user preferences",
    };
  }
}

// ================================
// Transcription Persistence & Migration Actions
// ================================

/**
 * Export transcription configuration to JSON
 */
export async function exportTranscriptionConfig(): Promise<{
  isSuccess: boolean;
  data?: string;
  message?: string;
}> {
  try {
    const configJson = await invoke<string>("export_transcription_config");
    return {
      isSuccess: true,
      data: configJson,
      message: "Transcription configuration exported successfully",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to export transcription configuration",
    };
  }
}

/**
 * Import transcription configuration from JSON
 */
export async function importTranscriptionConfig(
  configJson: string,
  mergeWithExisting: boolean = false
): Promise<{
  isSuccess: boolean;
  message?: string;
}> {
  try {
    await invoke("import_transcription_config", { configJson, mergeWithExisting });
    return {
      isSuccess: true,
      message: "Transcription configuration imported successfully",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to import transcription configuration",
    };
  }
}

/**
 * Validate transcription settings
 */
export async function validateTranscriptionSettings(
  settings: TranscriptionSettings
): Promise<{
  isSuccess: boolean;
  data?: { isValid: boolean; errors: string[] };
  message?: string;
}> {
  try {
    const validationResult = await invoke<{ isValid: boolean; errors: string[] }>(
      "validate_transcription_settings", 
      { settings }
    );
    return {
      isSuccess: true,
      data: validationResult,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to validate transcription settings",
    };
  }
}

/**
 * Migrate transcription settings for existing users
 */
export async function migrateTranscriptionSettings(): Promise<{
  isSuccess: boolean;
  data?: { migrated: boolean; changes: string[] };
  message?: string;
}> {
  try {
    const migrationResult = await invoke<{ migrated: boolean; changes: string[] }>(
      "migrate_transcription_settings"
    );
    return {
      isSuccess: true,
      data: migrationResult,
      message: migrationResult.migrated 
        ? "Transcription settings migrated successfully" 
        : "No migration needed",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to migrate transcription settings",
    };
  }
}

/**
 * Get default transcription prompt templates
 */
export async function getDefaultTranscriptionPromptTemplates(): Promise<{
  isSuccess: boolean;
  data?: TranscriptionPromptTemplate[];
  message?: string;
}> {
  try {
    const templates = await invoke<TranscriptionPromptTemplate[]>("get_default_transcription_prompt_templates");
    return {
      isSuccess: true,
      data: templates,
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to fetch default prompt templates",
    };
  }
}

/**
 * Reset prompt templates to defaults
 */
export async function resetTranscriptionPromptTemplatesToDefaults(): Promise<{
  isSuccess: boolean;
  message?: string;
}> {
  try {
    await invoke("reset_transcription_prompt_templates_to_defaults");
    return {
      isSuccess: true,
      message: "Prompt templates reset to defaults successfully",
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to reset prompt templates",
    };
  }
}

// ================================
// Settings Sanitization & Validation Utilities
// ================================

/**
 * Sanitize transcription settings before saving
 */
export function sanitizeTranscriptionSettings(settings: Partial<TranscriptionSettings>): Partial<TranscriptionSettings> {
  const sanitized: Partial<TranscriptionSettings> = {};

  if (settings.model !== undefined) {
    sanitized.model = settings.model.trim();
  }

  if (settings.language !== undefined) {
    // Normalize language code to lowercase
    sanitized.language = settings.language.toLowerCase().trim();
  }

  if (settings.prompt !== undefined) {
    // Trim whitespace and limit length
    const trimmedPrompt = settings.prompt.trim();
    sanitized.prompt = trimmedPrompt.length > 1000 ? trimmedPrompt.substring(0, 1000) : trimmedPrompt;
  }

  if (settings.temperature !== undefined) {
    // Clamp temperature between 0 and 1
    sanitized.temperature = Math.max(0, Math.min(1, settings.temperature));
  }

  if (settings.enablePersistence !== undefined) {
    sanitized.enablePersistence = Boolean(settings.enablePersistence);
  }

  if (settings.maxRetries !== undefined) {
    // Ensure positive integer
    sanitized.maxRetries = Math.max(0, Math.floor(settings.maxRetries));
  }

  if (settings.timeoutMs !== undefined) {
    // Ensure positive integer, minimum 1 second
    sanitized.timeoutMs = Math.max(1000, Math.floor(settings.timeoutMs));
  }

  if (settings.customPrompts !== undefined) {
    sanitized.customPrompts = settings.customPrompts;
  }

  return sanitized;
}

/**
 * Sanitize user preferences before saving
 */
export function sanitizeUserPreferences(preferences: Partial<TranscriptionUserPreferences>): Partial<TranscriptionUserPreferences> {
  const sanitized: Partial<TranscriptionUserPreferences> = {};

  if (preferences.defaultLanguage !== undefined) {
    sanitized.defaultLanguage = preferences.defaultLanguage.toLowerCase().trim();
  }

  if (preferences.defaultModel !== undefined) {
    sanitized.defaultModel = preferences.defaultModel.trim();
  }

  if (preferences.preferredPromptTemplateId !== undefined) {
    sanitized.preferredPromptTemplateId = preferences.preferredPromptTemplateId.trim();
  }

  if (preferences.autoSaveTranscriptions !== undefined) {
    sanitized.autoSaveTranscriptions = Boolean(preferences.autoSaveTranscriptions);
  }

  if (preferences.enableAdvancedSettings !== undefined) {
    sanitized.enableAdvancedSettings = Boolean(preferences.enableAdvancedSettings);
  }

  if (preferences.customSettings !== undefined) {
    sanitized.customSettings = preferences.customSettings;
  }

  return sanitized;
}

/**
 * Validate language code format
 */
export function isValidLanguageCode(languageCode: string): boolean {
  // ISO 639-1 (two-letter) or ISO 639-3 (three-letter) language codes
  const iso639Pattern = /^[a-z]{2,3}(-[A-Z]{2})?$/;
  return iso639Pattern.test(languageCode);
}

/**
 * Validate temperature value
 */
export function isValidTemperature(temperature: number): boolean {
  return typeof temperature === 'number' && temperature >= 0 && temperature <= 1 && !isNaN(temperature);
}

/**
 * Validate timeout value
 */
export function isValidTimeout(timeoutMs: number): boolean {
  return typeof timeoutMs === 'number' && timeoutMs >= 1000 && timeoutMs <= 300000 && !isNaN(timeoutMs);
}

/**
 * Validate max retries value
 */
export function isValidMaxRetries(maxRetries: number): boolean {
  return typeof maxRetries === 'number' && maxRetries >= 0 && maxRetries <= 10 && Number.isInteger(maxRetries);
}

/**
 * Get default transcription settings
 */
export function getDefaultTranscriptionSettings(): TranscriptionSettings {
  return {
    model: "whisper-large-v3",
    language: "en",
    prompt: "",
    temperature: 0.0,
    enablePersistence: true,
    maxRetries: 3,
    timeoutMs: 30000,
    customPrompts: [],
  };
}

/**
 * Get default user preferences
 */
export function getDefaultUserPreferences(): TranscriptionUserPreferences {
  return {
    defaultLanguage: "en",
    defaultModel: "whisper-large-v3",
    preferredPromptTemplateId: "",
    autoSaveTranscriptions: true,
    enableAdvancedSettings: false,
    customSettings: {},
  };
}

/**
 * Merge settings with defaults (for partial updates)
 */
export function mergeWithDefaults(
  partialSettings: Partial<TranscriptionSettings>,
  defaults?: TranscriptionSettings
): TranscriptionSettings {
  const defaultSettings = defaults || getDefaultTranscriptionSettings();
  return {
    ...defaultSettings,
    ...sanitizeTranscriptionSettings(partialSettings),
  };
}

/**
 * Check if settings are equivalent (deep comparison for objects)
 */
export function areSettingsEqual(
  settings1: TranscriptionSettings,
  settings2: TranscriptionSettings
): boolean {
  return JSON.stringify(settings1) === JSON.stringify(settings2);
}

// ================================
// Batch Operations
// ================================

/**
 * Batch update multiple transcription configuration aspects
 */
export async function batchUpdateTranscriptionConfig(updates: {
  settings?: Partial<TranscriptionSettings>;
  userPreferences?: Partial<TranscriptionUserPreferences>;
  promptTemplates?: Partial<TranscriptionPromptTemplate>[];
}): Promise<{
  isSuccess: boolean;
  results: {
    settings?: boolean;
    userPreferences?: boolean;
    promptTemplates?: boolean;
  };
  errors: string[];
}> {
  const results: { settings?: boolean; userPreferences?: boolean; promptTemplates?: boolean } = {};
  const errors: string[] = [];

  // Update settings if provided
  if (updates.settings) {
    try {
      const sanitized = sanitizeTranscriptionSettings(updates.settings);
      const result = await setTranscriptionSettings(sanitized);
      results.settings = result.isSuccess;
      if (!result.isSuccess && result.message) {
        errors.push(`Settings: ${result.message}`);
      }
    } catch (error) {
      results.settings = false;
      errors.push(`Settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Update user preferences if provided
  if (updates.userPreferences) {
    try {
      const sanitized = sanitizeUserPreferences(updates.userPreferences);
      const result = await setTranscriptionUserPreferences(sanitized);
      results.userPreferences = result.isSuccess;
      if (!result.isSuccess && result.message) {
        errors.push(`User Preferences: ${result.message}`);
      }
    } catch (error) {
      results.userPreferences = false;
      errors.push(`User Preferences: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Update prompt templates if provided
  if (updates.promptTemplates && updates.promptTemplates.length > 0) {
    try {
      let allTemplatesSuccessful = true;
      for (const template of updates.promptTemplates) {
        if (template.id) {
          const result = await updateTranscriptionPromptTemplate(template.id, template);
          if (!result.isSuccess) {
            allTemplatesSuccessful = false;
            if (result.message) {
              errors.push(`Template ${template.id}: ${result.message}`);
            }
          }
        }
      }
      results.promptTemplates = allTemplatesSuccessful;
    } catch (error) {
      results.promptTemplates = false;
      errors.push(`Prompt Templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  const isSuccess = Object.values(results).every(result => result !== false);

  return {
    isSuccess,
    results,
    errors,
  };
}

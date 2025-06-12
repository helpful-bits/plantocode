import { invoke } from "@tauri-apps/api/core";
import { type ActionState } from "@/types";
import { getErrorMessage, logError } from "@/utils/error-handling";
import { type TranscriptionSettings } from "./transcribe";

/**
 * Voice Transcription Settings Actions
 * 
 * Provides TypeScript actions for managing voice transcription settings,
 * including global settings, project-specific settings, and validation.
 */

// Get global transcription settings
export async function getTranscriptionSettings(): Promise<ActionState<TranscriptionSettings>> {
  try {
    const settings = await invoke<TranscriptionSettings>("get_transcription_settings_command");
    
    return {
      isSuccess: true,
      message: "Retrieved transcription settings successfully",
      data: settings,
    };
  } catch (error) {
    await logError(error, "getTranscriptionSettings");
    
    return {
      isSuccess: false,
      message: getErrorMessage(error, 'generic'),
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'generic'))
    };
  }
}

// Set global transcription settings
export async function setTranscriptionSettings(
  settings: TranscriptionSettings
): Promise<ActionState<void>> {
  try {
    // Validate settings before sending
    const validationResult = await validateTranscriptionSettings(settings);
    if (!validationResult.isSuccess || (validationResult.data && validationResult.data.length > 0)) {
      const errors = validationResult.data || [validationResult.message];
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
    
    await invoke<void>("set_transcription_settings_command", { settings });
    
    return {
      isSuccess: true,
      message: "Updated transcription settings successfully",
    };
  } catch (error) {
    await logError(error, "setTranscriptionSettings", { settings });
    
    return {
      isSuccess: false,
      message: getErrorMessage(error, 'generic'),
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'generic'))
    };
  }
}

// Get project-specific transcription settings
export async function getProjectTranscriptionSettings(
  projectDirectory: string
): Promise<ActionState<TranscriptionSettings>> {
  try {
    if (!projectDirectory || projectDirectory.trim().length === 0) {
      throw new Error("Project directory is required");
    }
    
    const settings = await invoke<TranscriptionSettings>("get_project_transcription_settings_command", {
      projectDirectory
    });
    
    return {
      isSuccess: true,
      message: "Retrieved project transcription settings successfully",
      data: settings,
    };
  } catch (error) {
    await logError(error, "getProjectTranscriptionSettings", { projectDirectory });
    
    return {
      isSuccess: false,
      message: getErrorMessage(error, 'generic'),
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'generic'))
    };
  }
}

// Set project-specific transcription settings
export async function setProjectTranscriptionSettings(
  projectDirectory: string,
  settings: TranscriptionSettings
): Promise<ActionState<void>> {
  try {
    if (!projectDirectory || projectDirectory.trim().length === 0) {
      throw new Error("Project directory is required");
    }
    
    // Validate settings before sending
    const validationResult = await validateTranscriptionSettings(settings);
    if (!validationResult.isSuccess || (validationResult.data && validationResult.data.length > 0)) {
      const errors = validationResult.data || [validationResult.message];
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
    
    await invoke<void>("set_project_transcription_settings_command", {
      projectDirectory,
      settings
    });
    
    return {
      isSuccess: true,
      message: "Updated project transcription settings successfully",
    };
  } catch (error) {
    await logError(error, "setProjectTranscriptionSettings", { projectDirectory, settings });
    
    return {
      isSuccess: false,
      message: getErrorMessage(error, 'generic'),
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'generic'))
    };
  }
}

// Reset transcription settings to defaults
export async function resetTranscriptionSettings(): Promise<ActionState<void>> {
  try {
    await invoke<void>("reset_transcription_settings_command");
    
    return {
      isSuccess: true,
      message: "Reset transcription settings to defaults successfully",
    };
  } catch (error) {
    await logError(error, "resetTranscriptionSettings");
    
    return {
      isSuccess: false,
      message: getErrorMessage(error, 'generic'),
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'generic'))
    };
  }
}

// Get effective transcription settings (merged global + project)
export async function getEffectiveTranscriptionSettings(
  projectDirectory?: string
): Promise<ActionState<TranscriptionSettings>> {
  try {
    const settings = await invoke<TranscriptionSettings>("get_effective_transcription_settings_command", {
      projectDirectory: projectDirectory || null
    });
    
    return {
      isSuccess: true,
      message: "Retrieved effective transcription settings successfully",
      data: settings,
    };
  } catch (error) {
    await logError(error, "getEffectiveTranscriptionSettings", { projectDirectory });
    
    return {
      isSuccess: false,
      message: getErrorMessage(error, 'generic'),
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'generic'))
    };
  }
}

// Validate transcription settings
export async function validateTranscriptionSettings(
  settings: TranscriptionSettings
): Promise<ActionState<string[]>> {
  try {
    const validationErrors = await invoke<string[]>("validate_transcription_settings_command", {
      settings
    });
    
    return {
      isSuccess: true,
      message: validationErrors.length === 0 ? "Settings are valid" : "Validation completed with errors",
      data: validationErrors,
    };
  } catch (error) {
    await logError(error, "validateTranscriptionSettings", { settings });
    
    return {
      isSuccess: false,
      message: getErrorMessage(error, 'generic'),
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'generic'))
    };
  }
}

// Helper function to merge transcription settings
export function mergeTranscriptionSettings(
  global: TranscriptionSettings,
  project?: TranscriptionSettings
): TranscriptionSettings {
  if (!project) return global;
  
  return {
    defaultLanguage: project.defaultLanguage ?? global.defaultLanguage,
    defaultPrompt: project.defaultPrompt ?? global.defaultPrompt,
    defaultTemperature: project.defaultTemperature ?? global.defaultTemperature,
    model: project.model ?? global.model,
  };
}

// Helper function to get default transcription settings
export function getDefaultTranscriptionSettings(): TranscriptionSettings {
  return {
    defaultLanguage: null,
    defaultPrompt: null,
    defaultTemperature: 0.7,
    model: null,
  };
}

// Helper function to check if settings are default
export function isDefaultTranscriptionSettings(settings: TranscriptionSettings): boolean {
  const defaults = getDefaultTranscriptionSettings();
  return (
    settings.defaultLanguage === defaults.defaultLanguage &&
    settings.defaultPrompt === defaults.defaultPrompt &&
    settings.defaultTemperature === defaults.defaultTemperature &&
    settings.model === defaults.model
  );
}
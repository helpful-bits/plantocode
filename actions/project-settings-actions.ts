"use server";

import { setupDatabase } from "@/lib/db";
import { getCachedState, saveCachedState } from "@/lib/db";
import { ActionState, TaskSettings } from "@/types";
import { MODEL_SETTINGS_KEY, DEFAULT_TASK_SETTINGS } from "@/lib/constants";
import { revalidatePath } from "next/cache";

/**
 * Get model settings for a specific project
 */
export async function getModelSettingsForProject(
  projectDirectory: string
): Promise<TaskSettings> {
  if (!projectDirectory) {
    return DEFAULT_TASK_SETTINGS;
  }

  await setupDatabase();
  
  try {
    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();
    
    // Get settings from cached_state
    const settingsJson = await getCachedState(safeProjectDirectory, MODEL_SETTINGS_KEY);
    
    if (!settingsJson) {
      console.log(`[getModelSettingsForProject] No settings found for project: ${safeProjectDirectory}`);
      return DEFAULT_TASK_SETTINGS;
    }
    
    // Parse the JSON string into TaskSettings
    try {
      const settings = JSON.parse(settingsJson) as TaskSettings;
      return settings;
    } catch (error) {
      console.error("[getModelSettingsForProject] Error parsing settings JSON:", error);
      return DEFAULT_TASK_SETTINGS;
    }
  } catch (error) {
    console.error("[getModelSettingsForProject]", error);
    return DEFAULT_TASK_SETTINGS;
  }
}

/**
 * Save model settings for a specific project
 */
export async function saveModelSettingsForProject(
  projectDirectory: string,
  settings: TaskSettings
): Promise<ActionState<null>> {
  try {
    if (!projectDirectory) {
      return { isSuccess: false, message: "Project directory is required" };
    }
    
    await setupDatabase();
    
    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();
    
    console.log(`[Action] Saving model settings for project: ${safeProjectDirectory}`);
    
    // Convert settings to JSON string
    const settingsJson = JSON.stringify(settings || {});
    
    // Save to cached_state table
    await saveCachedState(safeProjectDirectory, MODEL_SETTINGS_KEY, settingsJson);
    
    revalidatePath('/settings');
    return { 
      isSuccess: true, 
      message: "Model settings saved successfully" 
    };
  } catch (error) {
    console.error("[saveModelSettingsForProject]", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error saving model settings",
    };
  }
}

/**
 * Get a project setting by key
 */
export async function getProjectSetting(
  projectDirectory: string,
  key: string
): Promise<string | null> {
  if (!projectDirectory || !key) {
    return null;
  }

  await setupDatabase();
  
  try {
    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();
    
    // Get setting from cached_state
    const value = await getCachedState(safeProjectDirectory, key);
    return value;
  } catch (error) {
    console.error(`[getProjectSetting] Error getting setting ${key}:`, error);
    return null;
  }
}

/**
 * Save a project setting
 */
export async function saveProjectSetting(
  projectDirectory: string,
  key: string,
  value: string
): Promise<ActionState<null>> {
  try {
    if (!projectDirectory) {
      return { isSuccess: false, message: "Project directory is required" };
    }
    
    if (!key) {
      return { isSuccess: false, message: "Setting key is required" };
    }
    
    await setupDatabase();
    
    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();
    
    console.log(`[Action] Saving project setting ${key} for: ${safeProjectDirectory}`);
    
    // Save to cached_state table
    await saveCachedState(safeProjectDirectory, key, value);
    
    revalidatePath('/settings');
    return { 
      isSuccess: true, 
      message: "Setting saved successfully" 
    };
  } catch (error) {
    console.error(`[saveProjectSetting] Error saving setting ${key}:`, error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error saving setting",
    };
  }
} 
"use server";

import { setupDatabase } from "@/lib/db";
import { getCachedState, saveCachedState } from "@/lib/db";
import { ActionState, TaskSettings } from "@/types";
import { MODEL_SETTINGS_KEY } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { hashString } from "@/lib/utils";

/**
 * Get model settings for a specific project
 */
export async function getModelSettingsForProject(
  projectDirectory: string
): Promise<TaskSettings> {
  if (!projectDirectory) {
    return {};
  }

  await setupDatabase();
  
  try {
    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();
    
    // Get settings from cached_state
    const settingsJson = await getCachedState(safeProjectDirectory, MODEL_SETTINGS_KEY);
    
    if (!settingsJson) {
      console.log(`[getModelSettingsForProject] No settings found for project: ${safeProjectDirectory}`);
      return {};
    }
    
    // Parse the JSON string into TaskSettings
    try {
      const settings = JSON.parse(settingsJson) as TaskSettings;
      return settings;
    } catch (error) {
      console.error("[getModelSettingsForProject] Error parsing settings JSON:", error);
      return {};
    }
  } catch (error) {
    console.error("[getModelSettingsForProject]", error);
    return {};
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
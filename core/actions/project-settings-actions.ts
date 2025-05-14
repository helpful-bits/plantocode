"use server";

import { setupDatabase } from '@core/lib/db';
import { getCachedState, saveCachedState } from '@core/lib/db';
import { ActionState, TaskSettings } from '@core/types';
import { MODEL_SETTINGS_KEY, DEFAULT_TASK_SETTINGS } from '@core/lib/constants';
import { revalidatePath } from "next/cache";

/**
 * Get model settings for a specific project
 *
 * Will return a fully resolved settings object where every TaskType has
 * all parameters (model, maxTokens, temperature) defined.
 * If no settings exist for the project, default settings will be saved.
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
      console.log(`[getModelSettingsForProject] No settings found for project: ${safeProjectDirectory}. Saving default settings.`);

      // Save default settings back to database for this project
      await saveCachedState(safeProjectDirectory, MODEL_SETTINGS_KEY, JSON.stringify(DEFAULT_TASK_SETTINGS));
      return DEFAULT_TASK_SETTINGS;
    }

    // Parse the JSON string into TaskSettings
    try {
      const parsedSettings = JSON.parse(settingsJson) as TaskSettings;

      // Create a new resolved settings object that merges defaults with stored settings
      const resolvedSettings: TaskSettings = {} as TaskSettings;

      // Iterate through all TaskType keys in DEFAULT_TASK_SETTINGS
      Object.keys(DEFAULT_TASK_SETTINGS).forEach((taskType) => {
        const defaultConf = DEFAULT_TASK_SETTINGS[taskType as keyof TaskSettings];
        const storedConf = parsedSettings[taskType as keyof TaskSettings];

        // Merge default with stored, prioritizing stored values when they exist
        resolvedSettings[taskType as keyof TaskSettings] = {
          ...defaultConf,
          ...(storedConf || {}),
          // Ensure temperature is never undefined
          temperature: storedConf?.temperature ?? defaultConf.temperature
        };
      });

      return resolvedSettings;
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

/**
 * Generic action to get any cached state value with JSON parsing
 */
export async function getGenericCachedStateAction(
  projectDirectory: string | null,
  key: string
): Promise<ActionState<any | null>> {
  try {
    if (!key) {
      return { isSuccess: false, message: "Key is required" };
    }

    await setupDatabase();

    // Use a normalized project directory or "global" for null
    // This ensures consistency with saveGenericCachedStateAction
    const safeProjectDirectory = projectDirectory?.trim() || "global";

    // Get value from cached_state
    const rawValue = await getCachedState(safeProjectDirectory, key);

    if (!rawValue) {
      return { isSuccess: true, data: null };
    }

    // Try to parse JSON
    try {
      const parsedValue = JSON.parse(rawValue);
      return { isSuccess: true, data: parsedValue };
    } catch (parseError) {
      // Return raw value if not valid JSON
      return { isSuccess: true, data: rawValue };
    }
  } catch (error) {
    console.error(`[getGenericCachedStateAction] Error getting state for key ${key}:`, error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error getting cached state",
    };
  }
}

/**
 * Generic action to save any cached state value with JSON stringification
 */
export async function saveGenericCachedStateAction(
  projectDirectory: string | null,
  key: string,
  value: any
): Promise<ActionState<void>> {
  try {
    if (!key) {
      return { isSuccess: false, message: "Key is required" };
    }

    await setupDatabase();

    // Use a normalized project directory or use a special "global" directory for null
    // This ensures we never pass null to saveCachedState which would violate the NOT NULL constraint
    const safeProjectDirectory = projectDirectory?.trim() || "global";

    // Convert value to string if not already
    let stringValue: string;
    if (typeof value === 'string') {
      stringValue = value;
    } else {
      stringValue = JSON.stringify(value);
    }

    // Save to cached_state table
    await saveCachedState(safeProjectDirectory, key, stringValue);

    // Revalidate paths that might use this data
    revalidatePath('/');

    return {
      isSuccess: true,
      message: "State saved successfully"
    };
  } catch (error) {
    console.error(`[saveGenericCachedStateAction] Error saving state for key ${key}:`, error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error saving cached state",
    };
  }
} 
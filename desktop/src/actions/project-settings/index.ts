import { invoke } from "@tauri-apps/api/core";

import { type ActionState, type TaskSettings } from "@/types";
import { MODEL_SETTINGS_KEY, DEFAULT_TASK_SETTINGS } from "@/utils/constants";

// Define ConfigValue type to remove the redundant type constituents error
type ConfigValue = string | Record<string, unknown> | null;

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

  try {
    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();

    // Get settings using the generic cached state action
    const result = await getGenericCachedStateAction(
      safeProjectDirectory,
      MODEL_SETTINGS_KEY
    );

    const settingsJson = result.isSuccess ? result.data : null;

    if (!settingsJson) {

      // Save default settings using the generic cached state action
      await saveGenericCachedStateAction(
        safeProjectDirectory,
        MODEL_SETTINGS_KEY,
        DEFAULT_TASK_SETTINGS
      );
      return DEFAULT_TASK_SETTINGS;
    }

    // Parse the JSON string into TaskSettings (not needed as getGenericCachedStateAction already parses JSON)
    try {
      const parsedSettings = settingsJson as TaskSettings;

      // Create a new resolved settings object that merges defaults with stored settings
      const resolvedSettings: TaskSettings = {} as TaskSettings;

      // Iterate through all TaskType keys in DEFAULT_TASK_SETTINGS
      (Object.keys(DEFAULT_TASK_SETTINGS) as Array<keyof TaskSettings>).forEach(
        (settingsKey) => {
          // Use the provided default or fall back to unknown as a last resort
          const defaultConf =
            DEFAULT_TASK_SETTINGS[settingsKey] || DEFAULT_TASK_SETTINGS.unknown;
          const storedConf = parsedSettings
            ? parsedSettings[settingsKey]
            : undefined; // Safely access storedConf

          // Ensure all required properties are set with proper fallbacks
          resolvedSettings[settingsKey] = {
            model: storedConf?.model ?? defaultConf.model,
            maxTokens: storedConf?.maxTokens ?? defaultConf.maxTokens,
            temperature: storedConf?.temperature ?? defaultConf.temperature,
          };
        }
      );

      return resolvedSettings;
    } catch (error) {
      console.error(
        "[getModelSettingsForProject] Error processing settings:",
        error
      );
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

    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();


    // Save settings using the generic cached state action
    const result = await saveGenericCachedStateAction(
      safeProjectDirectory,
      MODEL_SETTINGS_KEY,
      settings
    );

    if (!result.isSuccess) {
      return {
        isSuccess: false,
        message: result.message || "Failed to save model settings",
      };
    }

    return {
      isSuccess: true,
      message: "Model settings saved successfully",
    };
  } catch (error) {
    console.error("[saveModelSettingsForProject]", error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error saving model settings",
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

  try {
    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();

    // Get setting using the generic cached state action
    const result = await getGenericCachedStateAction(safeProjectDirectory, key);

    // If the result is successful and we have data, return it as string if it's a string, or stringify if it's an object
    if (result.isSuccess && result.data !== null) {
      if (typeof result.data === "string") {
        return result.data;
      } else {
        return JSON.stringify(result.data);
      }
    }

    return null;
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

    // Use a normalized project directory
    const safeProjectDirectory = projectDirectory.trim();


    // Save setting using the generic cached state action
    const result = await saveGenericCachedStateAction(
      safeProjectDirectory,
      key,
      value
    );

    if (!result.isSuccess) {
      return {
        isSuccess: false,
        message: result.message || `Failed to save setting ${key}`,
      };
    }

    return {
      isSuccess: true,
      message: "Setting saved successfully",
    };
  } catch (error) {
    console.error(`[saveProjectSetting] Error saving setting ${key}:`, error);
    return {
      isSuccess: false,
      message:
        error instanceof Error ? error.message : "Unknown error saving setting",
    };
  }
}

/**
 * Generic action to get any cached state value with JSON parsing
 */
export async function getGenericCachedStateAction(
  projectDirectory: string | null,
  key: string
): Promise<ActionState<ConfigValue>> {
  try {
    if (!key) {
      return { isSuccess: false, message: "Key is required" };
    }

    // Use a normalized project directory or "global" for null
    // This ensures consistency with saveGenericCachedStateAction
    const safeProjectDirectory = projectDirectory?.trim() || "global";

    // Create full key that includes the project directory
    const fullKey = `${safeProjectDirectory}:${key}`;

    // Get value using direct Tauri command
    const result = await invoke<string | null>("get_key_value_command", {
      key: fullKey,
    });

    if (result === null) {
      return { isSuccess: true, data: null };
    }

    // Try to parse JSON
    try {
      const parsedData = JSON.parse(result) as ConfigValue;
      return { isSuccess: true, data: parsedData };
    } catch (_parseError) {
      // Return raw value if not valid JSON
      return { isSuccess: true, data: result as ConfigValue };
    }
  } catch (error) {
    console.error(
      `[getGenericCachedStateAction] Error getting state for key ${key}:`,
      error
    );
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error getting cached state",
    };
  }
}

/**
 * Generic action to save any cached state value with JSON stringification
 */
export async function saveGenericCachedStateAction(
  projectDirectory: string | null,
  key: string,
  value: Record<string, unknown> | string
): Promise<ActionState<void>> {
  try {
    if (!key) {
      return { isSuccess: false, message: "Key is required" };
    }

    // Use a normalized project directory or use a special "global" directory for null
    // This ensures we never pass null to the database which would violate the NOT NULL constraint
    const safeProjectDirectory = projectDirectory?.trim() || "global";

    // Create full key that includes the project directory
    const fullKey = `${safeProjectDirectory}:${key}`;

    // Convert value to string if not already
    let stringValue: string;
    if (typeof value === "string") {
      stringValue = value;
    } else {
      stringValue = JSON.stringify(value);
    }

    // Save value using direct Tauri command
    await invoke("set_key_value_command", { key: fullKey, value: stringValue });

    return {
      isSuccess: true,
      message: "State saved successfully",
    };
  } catch (error) {
    console.error(
      `[saveGenericCachedStateAction] Error saving state for key ${key}:`,
      error
    );
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error saving cached state",
    };
  }
}
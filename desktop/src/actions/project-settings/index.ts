import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { handleActionError } from "@/utils/action-utils";

// Re-export functions from the primary project-settings.actions file
export { 
  getProjectSettingAction as getProjectSetting,
  saveProjectSettingAction as saveProjectSetting,
  getServerDefaultTaskModelSettings
} from "../project-settings.actions";

// Define ConfigValue type to remove the redundant type constituents error
type ConfigValue = string | Record<string, unknown> | null;

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
    return handleActionError(error) as ActionState<ConfigValue>;
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
    return handleActionError(error) as ActionState<void>;
  }
}
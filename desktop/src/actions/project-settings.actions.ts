/**
 * Project Settings Actions
 *
 * Direct actions for project settings operations using Tauri invoke commands.
 */

import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { type TaskSettings } from "@/types/task-settings-types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Simple string hashing function for client-side key generation
 * Implementation of djb2 hash algorithm
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}


/**
 * Get task model settings for a project
 * Fetches complete task model settings from the backend, falling back to defaults if not found
 */
export async function getModelSettingsForProject(
  projectDirectory: string
): Promise<ActionState<TaskSettings | null>> {
  try {
    // Check if we have a valid project directory
    if (!projectDirectory) {
      console.warn("getModelSettingsForProject: No project directory provided");
      return {
        isSuccess: false,
        message: "No project directory provided",
        data: undefined,
      };
    }

    // Get complete settings from Tauri backend (project specific + defaults)
    const settingsJson = await invoke<string>(
      "get_all_task_model_settings_for_project_command",
      {
        projectDirectory,
      }
    );

    try {
      // Parse the JSON string
      const settings = JSON.parse(settingsJson) as TaskSettings;

      return {
        isSuccess: true,
        message: "Settings loaded successfully",
        data: settings,
      };
    } catch (parseError) {
      console.error("Error parsing task model settings:", parseError);
      return {
        isSuccess: false,
        message: "Error parsing settings",
        data: undefined,
      };
    }
  } catch (error) {
    console.error("Error getting task model settings for project:", error);
    return handleActionError(error) as ActionState<TaskSettings | null>;
  }
}

/**
 * Save task model settings for a project
 */
export async function saveProjectTaskModelSettingsAction(
  projectDirectory: string,
  settings: TaskSettings
): Promise<ActionState<void>> {
  try {
    if (!projectDirectory) {
      return {
        isSuccess: false,
        message: "No project directory provided",
      };
    }

    // Convert settings to JSON string
    const settingsJson = JSON.stringify(settings);

    // Save settings to Tauri backend
    await invoke("set_project_task_model_settings_command", {
      projectDirectory,
      settingsJson,
    });

    return {
      isSuccess: true,
      message: "Settings saved successfully",
    };
  } catch (error) {
    console.error("Error saving project task model settings:", error);
    return handleActionError(error) as ActionState<void>;
  }
}


/**
 * Get a project-specific setting value
 */
export async function getProjectSettingAction(
  projectDirectory: string,
  key: string
): Promise<ActionState<string | null>> {
  try {
    if (!projectDirectory || !key) {
      return {
        isSuccess: false,
        message: "Missing project directory or key",
        data: undefined,
      };
    }

    // Create a project-specific key by prefixing with hash of the project directory
    const projectHash = hashString(projectDirectory);
    const projectScopedKey = `project_${projectHash}_${key}`;

    // Get the value from the key-value store
    const value = await invoke<string | null>("get_key_value_command", {
      key: projectScopedKey,
    });

    return {
      isSuccess: true,
      message: value ? "Setting loaded successfully" : "Setting not found",
      data: value,
    };
  } catch (error) {
    console.error(`Error getting project setting '${key}':`, error);
    return handleActionError(error) as ActionState<string | null>;
  }
}

/**
 * Save a project-specific setting value
 */
export async function saveProjectSettingAction(
  projectDirectory: string,
  key: string,
  value: string
): Promise<ActionState<void>> {
  try {
    if (!projectDirectory || !key) {
      return {
        isSuccess: false,
        message: "Missing project directory or key",
      };
    }

    // Create a project-specific key by prefixing with hash of the project directory
    const projectHash = hashString(projectDirectory);
    const projectScopedKey = `project_${projectHash}_${key}`;

    // Save the value to the key-value store
    await invoke("set_key_value_command", {
      key: projectScopedKey,
      value,
    });

    return {
      isSuccess: true,
      message: "Setting saved successfully",
    };
  } catch (error) {
    console.error(`Error saving project setting '${key}':`, error);
    return handleActionError(error) as ActionState<void>;
  }
}

/**
 * Project Settings Actions
 *
 * Actions for server-managed settings operations using Tauri invoke commands.
 * Project-level settings persistence has been removed per architectural changes.
 */

import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { type TaskSettings } from "@/types/task-settings-types";
import { handleActionError } from "@/utils/action-utils";

/**
 * Get server default task model settings (without project overrides)
 */
export async function getServerDefaultTaskModelSettings(): Promise<ActionState<TaskSettings | null>> {
  try {
    const settingsJson = await invoke<string>("get_server_default_task_model_settings_command");
    
    try {
      const settings = JSON.parse(settingsJson) as TaskSettings;
      return {
        isSuccess: true,
        message: "Server defaults loaded successfully",
        data: settings,
      };
    } catch (parseError) {
      console.error("Error parsing server default settings:", parseError);
      return {
        isSuccess: false,
        message: "Error parsing server defaults",
        data: undefined,
      };
    }
  } catch (error) {
    console.error("Error getting server default task model settings:", error);
    return handleActionError(error) as ActionState<TaskSettings | null>;
  }
}

/**
 * Get task model settings for a project using project hash
 */
export async function getProjectSettingAction(projectDirectory: string): Promise<ActionState<TaskSettings | null>> {
  try {
    if (!projectDirectory || typeof projectDirectory !== "string" || !projectDirectory.trim()) {
      return {
        isSuccess: false,
        message: "Project directory is required and must be a valid string",
        data: null,
      };
    }

    const settings = await invoke<TaskSettings>("get_all_task_model_settings_for_project_command", {
      projectDirectory,
    });
    
    return {
      isSuccess: true,
      message: "Project settings loaded successfully",
      data: settings,
    };
  } catch (error) {
    console.error("Error getting project task model settings:", error);
    return handleActionError(error) as ActionState<TaskSettings | null>;
  }
}

/**
 * Save task model settings for a project using project hash
 */
export async function saveProjectSettingAction(projectDirectory: string, settings: TaskSettings): Promise<ActionState<void>> {
  try {
    if (!projectDirectory || typeof projectDirectory !== "string" || !projectDirectory.trim()) {
      return {
        isSuccess: false,
        message: "Project directory is required and must be a valid string",
      };
    }

    if (!settings) {
      return {
        isSuccess: false,
        message: "Settings data is required",
      };
    }

    const settingsJson = JSON.stringify(settings);
    
    await invoke("set_project_task_model_settings_command", {
      projectDirectory,
      settingsJson,
    });
    
    return {
      isSuccess: true,
      message: "Project settings saved successfully",
    };
  } catch (error) {
    console.error("Error saving project task model settings:", error);
    return handleActionError(error) as ActionState<void>;
  }
}
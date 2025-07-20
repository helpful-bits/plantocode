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

async function invalidateRuntimeConfigCache() {
  try {
    // Force refresh the runtime config cache directly
    await invoke("fetch_runtime_ai_config");
  } catch (error) {
    console.warn("Failed to invalidate runtime config cache:", error);
  }
}

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


/**
 * Get project task model settings with overrides
 */
export async function getProjectTaskModelSettings(projectDirectory: string): Promise<ActionState<TaskSettings | null>> {
  try {
    if (!projectDirectory || typeof projectDirectory !== "string" || !projectDirectory.trim()) {
      return {
        isSuccess: false,
        message: "Project directory is required and must be a valid string",
        data: null,
      };
    }

    const settingsJson = await invoke<string>("get_project_task_model_settings_command", {
      projectDirectory,
    });
    
    try {
      const settings = JSON.parse(settingsJson) as TaskSettings;
      return {
        isSuccess: true,
        message: "Project task model settings loaded successfully",
        data: settings,
      };
    } catch (parseError) {
      console.error("Error parsing project task model settings:", parseError);
      return {
        isSuccess: false,
        message: "Error parsing project task model settings",
        data: null,
      };
    }
  } catch (error) {
    console.error("Error getting project task model settings:", error);
    return handleActionError(error) as ActionState<TaskSettings | null>;
  }
}

/**
 * Set a specific project task setting
 */
export async function setProjectTaskSetting(
  projectDirectory: string,
  taskKey: string,
  settingKey: string,
  value: any
): Promise<ActionState<void>> {
  try {
    if (!projectDirectory || typeof projectDirectory !== "string" || !projectDirectory.trim()) {
      return {
        isSuccess: false,
        message: "Project directory is required and must be a valid string",
      };
    }

    if (!taskKey || typeof taskKey !== "string" || !taskKey.trim()) {
      return {
        isSuccess: false,
        message: "Task key is required and must be a valid string",
      };
    }

    if (!settingKey || typeof settingKey !== "string" || !settingKey.trim()) {
      return {
        isSuccess: false,
        message: "Setting key is required and must be a valid string",
      };
    }

    const valueJson = JSON.stringify(value);
    
    await invoke("set_project_task_setting_command", {
      projectDirectory,
      taskKey,
      settingKey,
      valueJson,
    });
    
    // Immediately invalidate runtime config cache
    await invalidateRuntimeConfigCache();
    
    return {
      isSuccess: true,
      message: "Project task setting saved successfully",
    };
  } catch (error) {
    console.error("Error setting project task setting:", error);
    return handleActionError(error) as ActionState<void>;
  }
}

/**
 * Reset a specific project task setting to server default
 */
export async function resetProjectTaskSetting(
  projectDirectory: string,
  taskKey: string,
  settingKey: string
): Promise<ActionState<void>> {
  try {
    if (!projectDirectory || typeof projectDirectory !== "string" || !projectDirectory.trim()) {
      return {
        isSuccess: false,
        message: "Project directory is required and must be a valid string",
      };
    }

    if (!taskKey || typeof taskKey !== "string" || !taskKey.trim()) {
      return {
        isSuccess: false,
        message: "Task key is required and must be a valid string",
      };
    }

    if (!settingKey || typeof settingKey !== "string" || !settingKey.trim()) {
      return {
        isSuccess: false,
        message: "Setting key is required and must be a valid string",
      };
    }
    
    await invoke("reset_project_task_setting_command", {
      projectDirectory,
      taskKey,
      settingKey,
    });
    
    // Immediately invalidate runtime config cache
    await invalidateRuntimeConfigCache();
    
    return {
      isSuccess: true,
      message: "Project task setting reset to server default successfully",
    };
  } catch (error) {
    console.error("Error resetting project task setting:", error);
    return handleActionError(error) as ActionState<void>;
  }
}
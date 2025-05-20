import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { hashString } from "@/utils/hash";

import { saveGenericCachedStateAction } from "../project-settings";

import { getSessionAction } from "./crud.actions";

// For debug logging
const DEBUG_LOGS = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true";

/**
 * Update a session's project directory
 */
export async function updateSessionProjectDirectoryAction(
  sessionId: string,
  projectDirectory: string
): Promise<ActionState<null>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // Get current session to get the old project directory
    const sessionResult = await getSessionAction(sessionId);

    if (!sessionResult.isSuccess || !sessionResult.data) {
      return {
        isSuccess: false,
        message: `Session with ID ${sessionId} not found`,
      };
    }

    const oldProjectDirectory = sessionResult.data.projectDirectory;

    // Update the project directory using the Tauri command
    await invoke("update_session_project_directory_command", {
      sessionId,
      projectDirectory,
    });

    // If this was the active session for the old project, clear it
    const oldProjectKey = `activeSession:${hashString(oldProjectDirectory)}`;
    await saveGenericCachedStateAction("global", oldProjectKey, "");

    // Set this as the active session for the new project directory
    const newProjectKey = `activeSession:${hashString(projectDirectory)}`;
    await saveGenericCachedStateAction("global", newProjectKey, sessionId);

    return {
      isSuccess: true,
      message: "Project directory updated successfully",
    };
  } catch (error) {
    console.error(`[updateSessionProjectDirectoryAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to update session project directory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Clear all sessions for a specific project
 */
export async function clearSessionsAction(
  projectDirectory: string
): Promise<ActionState<null>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // Use the Tauri command to clear all sessions for the project
    await invoke("clear_all_project_sessions_command", { projectDirectory });

    // Clear the active session for this project
    const projectKey = `activeSession:${hashString(projectDirectory)}`;
    await saveGenericCachedStateAction("global", projectKey, "");

    return {
      isSuccess: true,
      message: "All sessions cleared successfully",
    };
  } catch (error) {
    console.error(`[clearSessionsAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to clear sessions: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
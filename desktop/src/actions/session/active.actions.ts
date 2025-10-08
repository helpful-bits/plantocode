import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { hashString } from "@/utils/hash";
import { handleActionError } from "@/utils/action-utils";

import {
  getGenericCachedStateAction,
  saveGenericCachedStateAction,
} from "../project-settings/index";

/**
 * Set the active session for a project
 */
export async function setActiveSessionAction(
  projectDirectory: string,
  sessionId: string | null,
  options?: { broadcast?: boolean }
): Promise<ActionState<void>> {
  try {

    // Generate the key
    const projectKey = `activeSession:${hashString(projectDirectory)}`;

    // Save using the generic cached state action
    // Note: pass "global" as projectDirectory since the project context is already embedded in the key
    const result = await saveGenericCachedStateAction(
      "global",
      projectKey,
      sessionId || "" // Convert null to empty string to satisfy type requirements
    );

    if (!result.isSuccess) {
      return {
        isSuccess: false,
        message: result.message || "Failed to set active session",
      };
    }

    if (options?.broadcast !== false) {
      await invoke("broadcast_active_session_changed_command", {
        projectDirectory,
        sessionId,
      });
    }

    return {
      isSuccess: true,
      message: "Active session updated successfully",
    };
  } catch (error) {
    console.error(`[setActiveSessionAction] Error:`, error);
    return handleActionError(error) as ActionState<void>;
  }
}

/**
 * Get the active session ID for a project
 */
export async function getActiveSessionIdAction(
  projectDirectory: string
): Promise<ActionState<string | null>> {
  try {

    // Generate the key
    const projectKey = `activeSession:${hashString(projectDirectory)}`;

    // Get using the generic cached state action
    // Note: pass "global" as projectDirectory since the project context is already embedded in the key
    const result = await getGenericCachedStateAction("global", projectKey);
    const activeSessionId = result.isSuccess ? result.data as string | null : null;

    return {
      isSuccess: true,
      data: activeSessionId,
      message: "Active session ID retrieved successfully",
    };
  } catch (error) {
    console.error(`[getActiveSessionIdAction] Error:`, error);
    return handleActionError(error) as ActionState<string | null>;
  }
}

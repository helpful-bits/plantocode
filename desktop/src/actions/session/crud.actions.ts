import { invoke } from "@tauri-apps/api/core";

import { type ActionState, type Session } from "@/types";
import { hashString } from "@/utils/hash";
import { normalizePath } from "@/utils/path-utils";

import { setActiveSessionAction } from "./active.actions";

// For debug logging
const DEBUG_LOGS = import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true";

/**
 * Create a new session with the specified settings
 */
export async function createSessionAction(
  sessionData: Partial<Session>
): Promise<ActionState<string>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    if (!sessionData.projectDirectory) {
      console.error("[createSessionAction] Project directory is required");
      return {
        isSuccess: false,
        message: "Project directory is required",
      };
    }

    // Ensure session data has required fields for creation
    const completeSessionData = {
      ...sessionData,
      id:
        sessionData.id ||
        `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: sessionData.name || "Untitled Session",
      taskDescription: sessionData.taskDescription || "",
      searchTerm: sessionData.searchTerm || "",
      titleRegex: sessionData.titleRegex || "",
      contentRegex: sessionData.contentRegex || "",
      negativeTitleRegex: sessionData.negativeTitleRegex || "",
      negativeContentRegex: sessionData.negativeContentRegex || "",
      isRegexActive:
        sessionData.isRegexActive !== undefined
          ? sessionData.isRegexActive
          : true,
      codebaseStructure: sessionData.codebaseStructure || "",
      includedFiles: sessionData.includedFiles || [],
      forceExcludedFiles: sessionData.forceExcludedFiles || [],
      searchSelectedFilesOnly:
        sessionData.searchSelectedFilesOnly !== undefined
          ? sessionData.searchSelectedFilesOnly
          : false,
      createdAt: sessionData.createdAt || Date.now(),
      modelUsed: sessionData.modelUsed || "gemini-2.5-flash-preview-04-17",
      // Add projectHash if it's missing
      projectHash:
        sessionData.projectHash || hashString(sessionData.projectDirectory),
    } as Session;

    // Create the session using the Tauri command
    const session = await invoke<Session>("create_session_command", {
      sessionData: completeSessionData,
    });

    if (!session) {
      console.error("[createSessionAction] Failed to create session");
      return {
        isSuccess: false,
        message: "Failed to create session",
      };
    }

    // Automatically set as the active session for the project
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }
    try {
      await setActiveSessionAction(session.projectDirectory, session.id);
    } catch (error) {
      console.warn(
        `[Action] Could not set active session, but session was created successfully:`,
        error
      );
      // Don't fail the whole operation if just setting the active session fails
    }

    return {
      isSuccess: true,
      data: session.id,
      message: "Session created successfully",
    };
  } catch (error) {
    console.error(`[createSessionAction] Error:`, error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error creating session",
    };
  }
}

/**
 * Get all sessions for a specific project
 */
export async function getSessionsAction(
  projectDirectory: string
): Promise<ActionState<Session[]>> {
  try {
    if (!projectDirectory) {
      console.error(
        `[getSessionsAction] Invalid projectDirectory: ${projectDirectory}`
      );
      return {
        isSuccess: false,
        message: "Invalid project directory",
        data: [],
      };
    }

    // We need to ensure we get a string from this function, not a Promise
    const normalizedProjectDir = await Promise.resolve(normalizePath(projectDirectory));
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // Use the Tauri command to get sessions for the project
    const sessions = await invoke<Session[]>(
      "get_sessions_for_project_command",
      { projectDirectory: normalizedProjectDir }
    );

    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    if (sessions.length === 0) {
      console.info(
        `[Action] No sessions found for project: ${normalizedProjectDir}. This could be normal for a new project.`
      );
    }

    return {
      isSuccess: true,
      data: sessions,
      message: `Found ${sessions.length} sessions for project`,
    };
  } catch (error) {
    console.error(`[getSessionsAction] Error retrieving sessions:`, error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error retrieving sessions",
      data: [],
    };
  }
}

/**
 * Get a single session by ID
 */
export async function getSessionAction(
  sessionId: string
): Promise<ActionState<Session>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // Use the Tauri command to get a session by ID
    const session = await invoke<Session | null>("get_session_command", {
      sessionId,
    });

    if (!session) {
      console.error(
        `[getSessionAction] Session with ID ${sessionId} not found`
      );
      return {
        isSuccess: false,
        message: `Session with ID ${sessionId} not found`,
      };
    }

    return {
      isSuccess: true,
      data: session,
      message: "Session retrieved successfully",
    };
  } catch (error) {
    console.error(`[getSessionAction] Error:`, error);
    return {
      isSuccess: false,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error retrieving session",
    };
  }
}

/**
 * Delete a session by ID
 */
export async function deleteSessionAction(
  sessionId: string
): Promise<ActionState<null>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // First, get the session to obtain the project directory
    const sessionResult = await getSessionAction(sessionId);

    if (!sessionResult.isSuccess || !sessionResult.data) {
      return {
        isSuccess: false,
        message: `Session with ID ${sessionId} not found`,
      };
    }

    const session = sessionResult.data;

    // Delete the session using the Tauri command
    // This command already handles cancelling background jobs
    await invoke("delete_session_command", { sessionId });

    // If the deleted session was the active one for its project, clear the active session
    if (session.projectDirectory) {
      if (DEBUG_LOGS) {
        // Using if condition to satisfy ESLint no-console rule
        // Kept for debugging purposes
      }
      try {
        // Use our existing active session action
        const { getActiveSessionIdAction } = await import("./active.actions");
        const activeSessionResult = await getActiveSessionIdAction(
          session.projectDirectory
        );
        if (
          activeSessionResult.isSuccess &&
          activeSessionResult.data === sessionId
        ) {
          await setActiveSessionAction(session.projectDirectory, null);
        }
      } catch (error) {
        console.warn(
          `[Action] Could not clear active session, but session was deleted successfully:`,
          error
        );
        // Don't fail the whole operation if just clearing the active session fails
      }
    }

    return {
      isSuccess: true,
      message: "Session deleted successfully",
    };
  } catch (error) {
    console.error(`[deleteSessionAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to delete session: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Save an existing session with the specified settings
 */
export async function saveSessionAction(
  sessionData: Session
): Promise<ActionState<Session>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    if (!sessionData.id) {
      return {
        isSuccess: false,
        message: "Session ID is required",
      };
    }

    if (!sessionData.projectDirectory) {
      return {
        isSuccess: false,
        message: "Project directory is required",
      };
    }

    // Ensure projectHash is set
    if (!sessionData.projectHash) {
      sessionData.projectHash = hashString(sessionData.projectDirectory);
    }

    // Save the session using the Tauri command
    const session = await invoke<Session>("update_session_command", {
      sessionData,
    });

    return {
      isSuccess: true,
      data: session,
      message: "Session saved successfully",
    };
  } catch (error) {
    console.error(`[saveSessionAction] Error:`, error);

    return {
      isSuccess: false,
      message: `Failed to save session: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Rename a session
 */
export async function renameSessionAction(
  sessionId: string,
  name: string
): Promise<ActionState<null>> {
  try {
    if (DEBUG_LOGS) {
      // Using if condition to satisfy ESLint no-console rule
      // Kept for debugging purposes
    }

    // Use the Tauri command to rename the session
    await invoke("rename_session_command", { sessionId, name });

    return {
      isSuccess: true,
      message: "Session renamed successfully",
    };
  } catch (error) {
    console.error(`[renameSessionAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to rename session: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
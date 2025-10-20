import { invoke } from "@tauri-apps/api/core";

import { type ActionState, type Session } from "@/types";
import { normalizePath } from "@/utils/path-utils";
import { createLogger } from "@/utils/logger";
import { handleActionError } from "@/utils/action-utils";

import { setActiveSessionAction } from "./active.actions";

const logger = createLogger({ namespace: "SessionCrud" });

/**
 * Create a new session with the specified settings
 */
export async function createSessionAction(
  sessionData: Partial<Session>
): Promise<ActionState<string>> {
  try {
    if (!sessionData.projectDirectory) {
      logger.error("Project directory is required");
      return {
        isSuccess: false,
        message: "Project directory is required",
      };
    }

    // The backend now handles all defaults, so we only need to pass what we have
    const sessionRequest = {
      ...sessionData,
      projectDirectory: sessionData.projectDirectory,
    };

    // Log the data being sent to Tauri for debugging
    logger.debug("Sending to Tauri:", {
      projectDirectory: sessionRequest.projectDirectory,
      hasAllRequiredFields: !!sessionRequest.projectDirectory,
    });

    // Create the session using the Tauri command
    const session = await invoke<Session>("create_session_command", {
      sessionData: sessionRequest,
    });

    if (!session) {
      logger.error("Failed to create session");
      return {
        isSuccess: false,
        message: "Failed to create session",
      };
    }

    // Automatically set as the active session for the project
    try {
      await setActiveSessionAction(session.projectDirectory, session.id);
    } catch (error) {
      logger.warn(
        `Could not set active session, but session was created successfully:`,
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
    logger.error(`Error:`, error);
    return handleActionError(error) as ActionState<string>;
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
      logger.error(
        `Invalid projectDirectory: ${projectDirectory}`
      );
      return {
        isSuccess: false,
        message: "Invalid project directory",
        data: [],
      };
    }

    // We need to ensure we get a string from this function, not a Promise
    const normalizedProjectDir = await Promise.resolve(normalizePath(projectDirectory));

    // Use the Tauri command to get sessions for the project
    const sessions = await invoke<Session[]>(
      "get_sessions_for_project_command",
      { projectDirectory: normalizedProjectDir }
    );

    if (sessions.length === 0) {
      logger.info(
        `No sessions found for project: ${normalizedProjectDir}. This could be normal for a new project.`
      );
    }

    return {
      isSuccess: true,
      data: sessions,
      message: `Found ${sessions.length} sessions for project`,
    };
  } catch (error) {
    logger.error(`Error retrieving sessions:`, error);
    return handleActionError(error) as ActionState<Session[]>;
  }
}

/**
 * Get a single session by ID
 */
export async function getSessionAction(
  sessionId: string
): Promise<ActionState<Session>> {
  try {
    // Use the Tauri command to get a session by ID
    const session = await invoke<Session | null>("get_session_command", {
      sessionId,
    });

    if (!session) {
      logger.error(
        `Session with ID ${sessionId} not found`
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
    logger.error(`Error:`, error);
    return handleActionError(error) as ActionState<Session>;
  }
}

/**
 * Delete a session by ID
 */
export async function deleteSessionAction(
  sessionId: string
): Promise<ActionState<null>> {
  try {
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
        logger.warn(
          `Could not clear active session, but session was deleted successfully:`,
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
    logger.error(`Error:`, error);
    return handleActionError(error) as ActionState<null>;
  }
}

/**
 * Save an existing session with the specified settings
 */
export async function saveSessionAction(
  sessionData: Session
): Promise<ActionState<Session>> {
  try {
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

    // Ensure projectDirectory is present for hash generation
    if (!sessionData.projectDirectory) {
      return {
        isSuccess: false,
        data: undefined,
        message: "Project directory is required for session update",
      };
    }

    // Save the session using the Tauri command (backend will generate projectHash from projectDirectory)
    const session = await invoke<Session>("update_session_command", {
      sessionData: sessionData,
    });

    return {
      isSuccess: true,
      data: session,
      message: "Session saved successfully",
    };
  } catch (error) {
    logger.error(`Error:`, error);
    return handleActionError(error) as ActionState<Session>;
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
    // Use the Tauri command to rename the session
    await invoke("rename_session_command", { sessionId, name });

    return {
      isSuccess: true,
      message: "Session renamed successfully",
    };
  } catch (error) {
    logger.error(`Error:`, error);
    return handleActionError(error) as ActionState<null>;
  }
}

/**
 * Duplicate a session
 */
export async function duplicateSessionAction(sourceSessionId: string, newName?: string): Promise<ActionState<Session>> {
  try {
    if (!sourceSessionId) {
      return { isSuccess: false, message: "Missing sourceSessionId" };
    }
    const newSession = await invoke<Session>("duplicate_session_command", { sourceSessionId, newName });
    return { isSuccess: true, data: newSession, message: "Session duplicated successfully" };
  } catch (err) {
    logger.error("Failed to duplicate session:", err);
    return handleActionError(err) as ActionState<Session>;
  }
}
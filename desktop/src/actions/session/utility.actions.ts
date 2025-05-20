import { invoke } from "@tauri-apps/api/core";

import {
  DatabaseError,
  DatabaseErrorCategory,
  DatabaseErrorSeverity,
} from "@/types/error-types";

/**
 * Clears the XML path from a session.
 *
 * This is a utility action to help reset the XML path when needed.
 */
export async function clearSessionXmlPathAction(sessionId: string) {
  if (!sessionId) {
    return {
      isSuccess: false,
      message: "Missing session ID",
    };
  }

  try {
    // Use the Tauri command to update specific fields of a session
    const fieldsToUpdate = { xmlPath: null };
    await invoke("update_session_fields_command", {
      sessionId,
      fieldsToUpdate,
    });

    return {
      isSuccess: true,
      message: "Session XML path cleared successfully",
    };
  } catch (error) {
    console.error(
      `[clearSessionXmlPathAction] Error clearing session XML path:`,
      error
    );
    const message = error instanceof Error ? error.message : String(error);

    return {
      isSuccess: false,
      message: `Failed to clear session XML path: ${message}`,
      error: new DatabaseError(`Failed to clear session XML path: ${message}`, {
        severity: DatabaseErrorSeverity.WARNING,
        category: DatabaseErrorCategory.OTHER,
        context: { sessionId },
      }),
    };
  }
}

/**
 * Resets a session state to its initial values.
 *
 * This is useful for clearing out session state without deleting the session entirely.
 */
export async function resetSessionStateAction(sessionId: string) {
  if (!sessionId) {
    return {
      isSuccess: false,
      message: "Missing session ID",
    };
  }

  try {
    // Use the Tauri command to update specific fields of a session
    const fieldsToUpdate = {
      taskDescription: "",
      selectedFiles: [],
      xmlPath: null,
      regexPatterns: null,
      implementationPlanJobId: null,
    };

    await invoke("update_session_fields_command", {
      sessionId,
      fieldsToUpdate,
    });

    return {
      isSuccess: true,
      message: "Session state reset successfully",
    };
  } catch (error) {
    console.error(
      `[resetSessionStateAction] Error resetting session state:`,
      error
    );
    const message = error instanceof Error ? error.message : String(error);

    return {
      isSuccess: false,
      message: `Failed to reset session state: ${message}`,
      error: new DatabaseError(`Failed to reset session state: ${message}`, {
        severity: DatabaseErrorSeverity.WARNING,
        category: DatabaseErrorCategory.OTHER,
        context: { sessionId },
      }),
    };
  }
}
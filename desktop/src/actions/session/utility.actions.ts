import { invoke } from "@tauri-apps/api/core";

import {
  DatabaseError,
  DatabaseErrorCategory,
  DatabaseErrorSeverity,
} from "@/types/error-types";


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
      includedFiles: [],
      titleRegex: "",
      contentRegex: "",
      negativeTitleRegex: "",
      negativeContentRegex: "",
      codebaseStructure: "",
      searchTerm: "",
      isRegexActive: true,
      searchSelectedFilesOnly: false,
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
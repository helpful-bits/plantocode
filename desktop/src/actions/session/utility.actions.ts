import { invoke } from "@tauri-apps/api/core";

import {
  DatabaseError,
  DatabaseErrorCategory,
  DatabaseErrorSeverity,
} from "@/types/error-types";
import { handleActionError } from "@/utils/action-utils";


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
    const errorState = handleActionError(error);
    return {
      ...errorState,
      error: new DatabaseError(`Failed to reset session state: ${errorState.message}`, {
        severity: DatabaseErrorSeverity.WARNING,
        category: DatabaseErrorCategory.OTHER,
        context: { sessionId },
      }),
    };
  }
}
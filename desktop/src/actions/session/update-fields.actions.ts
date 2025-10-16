"use server";

import { invoke } from "@tauri-apps/api/core";

import { type ActionState, type Session } from "@/types";
import { handleActionError } from "@/utils/action-utils";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "SessionUpdateFields" });

/**
 * Update specific fields of a session
 * This will emit events to sync with mobile devices
 */
export async function updateSessionFieldsAction(
  sessionId: string,
  fieldsToUpdate: Partial<Session>
): Promise<ActionState<Session>> {
  try {
    if (!sessionId) {
      return {
        isSuccess: false,
        message: "Session ID is required",
      };
    }

    // Dev-only guard: prevent misuse of updateSessionFieldsAction for queue-managed fields
    if (process.env.NODE_ENV !== "production") {
      const prohibitedFields = ["taskDescription", "mergeInstructions"];
      const hasProhibitedField = prohibitedFields.some(field => field in fieldsToUpdate);

      if (hasProhibitedField) {
        const error = new Error(
          `[DEV ERROR] Do NOT use updateSessionFieldsAction for ${prohibitedFields.filter(f => f in fieldsToUpdate).join(", ")}. ` +
          `Use queueTaskDescriptionUpdate() or queueMergeInstructionsUpdate() from @/actions/session/task-fields.actions instead.`
        );
        console.error(error.message);
        throw error;
      }
    }

    // Call the Tauri command that emits relay events
    const updatedSession = await invoke<Session>("update_session_fields_command", {
      sessionId: sessionId,
      fieldsToUpdate: fieldsToUpdate,
    });

    return {
      isSuccess: true,
      data: updatedSession,
      message: "Session fields updated successfully",
    };
  } catch (error) {
    logger.error(`Error updating session fields:`, error);
    return handleActionError(error) as ActionState<Session>;
  }
}

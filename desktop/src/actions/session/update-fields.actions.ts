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

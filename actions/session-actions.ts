"use server";

import { sessionRepository } from '@/lib/db/repository';
import { setupDatabase } from '@/lib/db/setup';
import { ActionState } from '@/types';

/**
 * Clears the geminiPatchPath field for a given session.
 * This is typically used when the patch file is confirmed to be missing.
 */
export async function clearSessionPatchPathAction(sessionId: string): Promise<ActionState<null>> {
    if (!sessionId) {
        return { isSuccess: false, message: "Session ID is required." };
    }

    await setupDatabase();

    try {
        const session = await sessionRepository.getSession(sessionId);
        if (!session) {
            return { isSuccess: false, message: `Session ${sessionId} not found.` };
        }

        // Use the full update method to preserve all other fields
        await sessionRepository.updateSessionGeminiStatus(
            sessionId,
            session.geminiStatus || 'idle', // Use existing status or default
            session.geminiStartTime,
            session.geminiEndTime,
            null, // Explicitly set patch path to null
            session.geminiStatusMessage,
            // Preserve existing stream stats if they exist
            {
                tokensReceived: session.geminiTokensReceived,
                charsReceived: session.geminiCharsReceived,
            }
        );
        return { isSuccess: true, message: "Session patch path cleared." };
    } catch (error) {
        return { isSuccess: false, message: `Failed to clear patch path: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/**
 * Resets a session's Gemini status to idle.
 * This is used to allow restarting processing for a session that was canceled or failed.
 */
export async function resetSessionStateAction(sessionId: string): Promise<ActionState<null>> {
    if (!sessionId) {
        return { isSuccess: false, message: "Session ID is required." };
    }

    await setupDatabase();

    try {
        const session = await sessionRepository.getSession(sessionId);
        if (!session) {
            return { isSuccess: false, message: `Session ${sessionId} not found.` };
        }

        // Reset the session to idle state
        await sessionRepository.updateSessionGeminiStatus(
            sessionId, 
            'idle', // Reset to idle
            null,   // Clear start time
            null,   // Clear end time
            null,   // Clear patch path
            null,   // Clear message
        );
        
        return { isSuccess: true, message: "Session state reset successfully." };
    } catch (error) {
        return { isSuccess: false, message: `Failed to reset session state: ${error instanceof Error ? error.message : String(error)}` };
    }
}

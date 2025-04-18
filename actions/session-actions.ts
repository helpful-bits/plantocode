"use server";

import { sessionRepository } from '@/lib/db';
import { setupDatabase } from '@/lib/db'; // Use index export
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

        // Find the *latest* request associated with the session that has a patch path
        const requests = await sessionRepository.getGeminiRequests(sessionId);
        const latestRequestWithPatch = requests.find(r => r.patchPath);

        if (!latestRequestWithPatch) {
            return { isSuccess: true, message: "No requests with patch paths found to clear." };
        }

        await sessionRepository.updateSessionGeminiStatus(
            sessionId,
            session.geminiStatus || 'idle', // Use existing status or default
            session.geminiStartTime,
            session.geminiEndTime,
            null // Set patch path to null for the session (summary)
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

        // Cancel any running Gemini requests associated with the session
        await sessionRepository.cancelAllSessionRequests(sessionId);

        // Reset the session's *summary* status to idle
        await sessionRepository.updateSessionGeminiStatus(
            sessionId,
            'idle', // Reset to idle
            null, // Clear fields managed by requests
            null,
            null,
            null,   // Clear message
        );
        
        return { isSuccess: true, message: "Session state reset successfully." };
    } catch (error) {
        return { isSuccess: false, message: `Failed to reset session state: ${error instanceof Error ? error.message : String(error)}` };
    }
}

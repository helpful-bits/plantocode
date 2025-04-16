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

        await sessionRepository.updateSessionGeminiStatus(sessionId, session.geminiStatus, session.geminiStartTime, session.geminiEndTime, null, session.geminiStatusMessage);
        return { isSuccess: true, message: "Session patch path cleared." };
    } catch (error) {
        return { isSuccess: false, message: `Failed to clear patch path: ${error instanceof Error ? error.message : String(error)}` };
    }
}

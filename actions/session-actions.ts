"use server";

import { sessionRepository } from '@/lib/db';
import { setupDatabase } from '@/lib/db'; // Use index export
import { ActionState } from '@/types';

/**
 * Clears the geminiXmlPath field for a given session.
 * This is typically used when the patch file is confirmed to be missing.
 */
export async function clearSessionXmlPathAction(sessionId: string): Promise<ActionState<null>> {
    try {
        if (!sessionId) {
            return { isSuccess: false, message: "Session ID is required" };
        }
        
        await setupDatabase();
        const repository = sessionRepository; // Use singleton repository
        
        // Check if we need to update the xml path for the last gemini request as well
        const requests = await repository.getGeminiRequests(sessionId);
        const latestRequestWithXml = requests.find(r => r.xmlPath);
        
        if (latestRequestWithXml) {
            await repository.updateGeminiRequestStatus(
                latestRequestWithXml.id,
                latestRequestWithXml.status,
                latestRequestWithXml.startTime,
                latestRequestWithXml.endTime,
                null, // Set xml path to null
                latestRequestWithXml.statusMessage || "XML file not found"
            );
        }
        
        return {
            isSuccess: true,
            message: "XML path cleared successfully",
        };
    } catch (error) {
        console.error("[clearSessionXmlPathAction]", error);
        return {
            isSuccess: false,
            message: error instanceof Error ? error.message : "Unknown error clearing XML path",
        };
    }
}

/**
 * Resets a session's Gemini request processing status.
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
        
        return { isSuccess: true, message: "Session state reset successfully." };
    } catch (error) {
        return { isSuccess: false, message: `Failed to reset session state: ${error instanceof Error ? error.message : String(error)}` };
    }
}

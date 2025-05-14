import { sessionRepository } from "../repositories";
import { hashString } from '@core/lib/hash';

/**
 * Ensures a session record exists in the database.
 *
 * This function is used to guarantee a valid session before creating dependent records
 * like background jobs. It addresses foreign key constraint issues by ensuring
 * the session_id always references a valid entry in the sessions table.
 *
 * @param sessionId Optional session ID to validate or use
 * @param projectDirectory Project directory for the session
 * @param operationContext A context hint about what operation is being performed (for logging)
 * @returns A valid session ID (the provided one if it exists)
 * @throws Error if sessionId is invalid and cannot be resolved to an existing session
 */
export async function ensureSessionRecord(
  sessionId: string | null,
  projectDirectory: string,
  operationContext: string = 'Operation'
): Promise<string> {
  console.log(`[SessionDB] Ensuring session record: sessionId=${sessionId}, operationContext=${operationContext}`);

  // If the sessionId is provided, check if it exists
  if (sessionId && typeof sessionId === 'string' && sessionId.trim()) {
    try {
      const existingSession = await sessionRepository.getSession(sessionId);

      if (existingSession) {
        console.log(`[SessionDB] Existing session found: ${sessionId}`);
        return sessionId;
      } else {
        // Session ID was provided but does not exist in the database
        const errorMessage = `Session ID ${sessionId} does not exist in the database`;
        console.error(`[SessionDB] ${errorMessage}`);
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error(`[SessionDB] Error checking session ${sessionId}:`, error);
      throw error; // Propagate the error - caller must handle invalid sessions
    }
  } else {
    // No valid sessionId was provided
    const errorMessage = "Session ID is required for this operation";
    console.error(`[SessionDB] ${errorMessage}`);
    throw new Error(errorMessage);
  }
}
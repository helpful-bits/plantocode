import { NextRequest, NextResponse } from 'next/server';
import { sessionRepository, setupDatabase } from '@/lib/db';
import { Session } from '@/types';

/**
 * PATCH /api/session/[sessionId]/state
 * Updates specific fields of a session without overwriting the entire session
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  // Await the params object before accessing its properties
  const { sessionId } = await params;
  
  if (!sessionId) {
    console.error(`[API session/state] No session ID provided in request`);
    return NextResponse.json(
      { error: 'Session ID is required' },
      { status: 400 }
    );
  }
  
  try {
    // Parse the request body
    const sessionData: Partial<Session> = await request.json();
    
    console.log(`[API session/state] Updating state for session ${sessionId}`, {
      fieldCount: Object.keys(sessionData).length,
      fieldNames: Object.keys(sessionData),
      taskLength: sessionData.taskDescription ? sessionData.taskDescription.length : 0,
      taskPreview: sessionData.taskDescription ? sessionData.taskDescription.substring(0, 40) + '...' : 'none'
    });
    
    // Ensure database is initialized
    await setupDatabase();
    
    // Validate that the session exists
    const existingSession = await sessionRepository.getSession(sessionId);
    if (!existingSession) {
      console.error(`[API session/state] Session ${sessionId} not found`);
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    console.log(`[API session/state] Found existing session ${sessionId}`, {
      name: existingSession.name,
      projectDirectory: existingSession.projectDirectory,
      currentTaskLength: existingSession.taskDescription ? existingSession.taskDescription.length : 0,
      currentTaskPreview: existingSession.taskDescription ? existingSession.taskDescription.substring(0, 40) + '...' : 'none'
    });
    
    // Validate session data fields
    const validationError = validateSessionData(sessionData);
    if (validationError) {
      console.error(`[API session/state] Validation error for session ${sessionId}: ${validationError}`);
      return NextResponse.json(
        { error: validationError },
        { status: 400 }
      );
    }
    
    // Check if task description is changing and it should overwrite
    // This helps diagnose task description sync issues
    if (sessionData.taskDescription !== undefined) {
      if (existingSession.taskDescription === sessionData.taskDescription) {
        console.log(`[API session/state] Task description unchanged for session ${sessionId}`);
      } else {
        console.log(`[API session/state] Task description changing for session ${sessionId}:`, {
          oldLength: existingSession.taskDescription ? existingSession.taskDescription.length : 0,
          newLength: sessionData.taskDescription ? sessionData.taskDescription.length : 0,
          oldPreview: existingSession.taskDescription ? existingSession.taskDescription.substring(0, 40) + '...' : 'none',
          newPreview: sessionData.taskDescription ? sessionData.taskDescription.substring(0, 40) + '...' : 'none'
        });
      }
    }
    
    // Update the session fields
    try {
      await sessionRepository.updateSessionFields(sessionId, sessionData);
      console.log(`[API session/state] Successfully updated session ${sessionId}`);
    } catch (dbError: any) {
      // Handle specific database errors
      if (dbError.message?.includes('Session not found')) {
        console.error(`[API session/state] Session ${sessionId} no longer exists during update`);
        return NextResponse.json(
          { error: 'Session no longer exists' },
          { status: 404 }
        );
      }
      
      if (dbError.message?.includes('database is locked') || dbError.code === 'SQLITE_BUSY') {
        console.error(`[API session/state] Database locked during update of session ${sessionId}`);
        return NextResponse.json(
          { error: 'Database is currently busy, please try again' },
          { status: 503 }
        );
      }
      
      console.error(`[API session/state] Database error updating session ${sessionId}:`, dbError);
      throw dbError; // Re-throw other errors to be caught by the outer catch
    }
    
    // Fetch the updated session to verify changes
    try {
      const updatedSession = await sessionRepository.getSession(sessionId);
      if (updatedSession && sessionData.taskDescription !== undefined) {
        console.log(`[API session/state] Verified task description update for session ${sessionId}:`, {
          length: updatedSession.taskDescription ? updatedSession.taskDescription.length : 0,
          preview: updatedSession.taskDescription ? updatedSession.taskDescription.substring(0, 40) + '...' : 'none',
          matches: updatedSession.taskDescription === sessionData.taskDescription
        });
      }
    } catch (verifyError) {
      console.error(`[API session/state] Error verifying session update for ${sessionId}:`, verifyError);
    }
    
    return NextResponse.json(
      { success: true, message: 'Session updated successfully' }
    );
  } catch (error) {
    console.error(`[API session/state] Error updating session ${sessionId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * Validate session data fields
 * @param sessionData The session data to validate
 * @returns A validation error message or null if valid
 */
function validateSessionData(sessionData: Partial<Session>): string | null {
  // Check for empty data
  if (!sessionData || Object.keys(sessionData).length === 0) {
    return 'No session data provided';
  }
  
  // Validate specific fields as needed
  if (sessionData.name !== undefined && sessionData.name.trim() === '') {
    return 'Session name cannot be empty';
  }
  
  // All checks passed
  return null;
} 
"use server";

import { sessionRepository, backgroundJobRepository } from '@/lib/db/repositories';
import { setupDatabase, setActiveSession } from '@/lib/db'; // Add setActiveSession
import { ActionState } from '@/types';
import { revalidatePath } from 'next/cache';
import { type Session } from '@/types';
import { handleActionError } from '@/lib/action-utils';
import { normalizePath } from '@/lib/path-utils';
import crypto from 'crypto';
import { hashString } from '@/lib/hash';

/**
 * Clears the xml path field for a given session.
 * This is typically used when the patch file is confirmed to be missing.
 */
export async function clearSessionXmlPathAction(sessionId: string): Promise<ActionState<null>> {
    try {
        if (!sessionId) {
            return { isSuccess: false, message: "Session ID is required" };
        }
        
        await setupDatabase();
        
        // Check if we need to update the xml path for any background jobs
        const session = await sessionRepository.getSessionWithBackgroundJobs(sessionId);
        if (!session || !session.backgroundJobs) {
            return { isSuccess: true, message: "No background jobs found to update" };
        }
        
        // Find the latest job with an XML path
        const latestJobWithXml = session.backgroundJobs.find(job => job.xmlPath);
        
        if (latestJobWithXml) {
            await backgroundJobRepository.updateBackgroundJobStatus({
                jobId: latestJobWithXml.id,
                status: latestJobWithXml.status,
                startTime: latestJobWithXml.startTime,
                endTime: latestJobWithXml.endTime,
                statusMessage: "XML file not found",
                metadata: {
                    xmlPath: null // Set XML path to null through metadata
                }
            });
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
 * Resets a session's background job processing status.
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

        // Cancel any running background jobs associated with the session
        await backgroundJobRepository.cancelAllSessionBackgroundJobs(sessionId);
        
        return { isSuccess: true, message: "Session state reset successfully." };
    } catch (error) {
        return { isSuccess: false, message: `Failed to reset session state: ${error instanceof Error ? error.message : String(error)}` };
    }
}

/**
 * Create a new session with the specified settings
 */
export async function createSessionAction(
  sessionData: Partial<Session>
): Promise<ActionState<Session>> {
  try {
    console.log(`[Action] Creating new session: ${sessionData.name || 'Untitled'}`);
    
    await setupDatabase();
    
    if (!sessionData.projectDirectory) {
      return {
        isSuccess: false,
        message: "Project directory is required"
      };
    }
    
    // Ensure session data has required fields for creation
    const completeSessionData = {
      ...sessionData,
      id: sessionData.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: sessionData.createdAt || Date.now(),
    } as Session;
    
    const session = await sessionRepository.saveSession(completeSessionData);
    
    // If this is a new session, automatically set it as the active session for the project
    if (session) {
      console.log(`[Action] Setting new session ${session.id} as active for project: ${session.projectDirectory}`);
      await setActiveSession(session.projectDirectory, session.id);
    }
    
    revalidatePath('/');
    
    return {
      isSuccess: true,
      data: session,
      message: "Session created successfully"
    };
  } catch (error) {
    console.error(`[createSessionAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to create session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get all sessions for a specific project
 */
export async function getSessionsAction(projectDirectory: string): Promise<ActionState<Session[]>> {
  try {
    console.log(`[Action] Getting sessions for project: ${projectDirectory}`);
    await setupDatabase();
    
    // Get all sessions and filter by project directory
    const allSessions = await sessionRepository.getAllSessions();
    const normalizedProjectDir = normalizePath(projectDirectory);
    
    // Filter sessions by project directory
    const filteredSessions = allSessions.filter(session => 
      normalizePath(session.projectDirectory) === normalizedProjectDir
    );
    
    console.log(`[Action] Found ${filteredSessions.length} sessions for project: ${projectDirectory}`);
    
    return {
      isSuccess: true,
      data: filteredSessions,
      message: "Sessions retrieved successfully"
    };
  } catch (error) {
    console.error(`[getSessionsAction] Error:`, error);
    
    return {
      isSuccess: false, 
      message: `Failed to get sessions: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get a single session by ID
 */
export async function getSessionAction(sessionId: string, signal?: AbortSignal): Promise<ActionState<Session>> {
  try {
    console.log(`[Action] Getting session: ${sessionId}`);
    
    // Don't check aborted status on the server directly
    // The AbortController signal cannot be accessed this way in server components
    
    await setupDatabase();
    const session = await sessionRepository.getSession(sessionId);
    
    if (!session) {
      return {
        isSuccess: false,
        message: `Session with ID ${sessionId} not found`
      };
    }
    
    return {
      isSuccess: true,
      data: session,
      message: "Session retrieved successfully"
    };
  } catch (error) {
    // Check if it's an abort error by name
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[Action] Get session operation aborted for session ${sessionId}`);
      return {
        isSuccess: false,
        message: 'Operation aborted'
      };
    }
    
    console.error(`[getSessionAction] Error:`, error);
    
    return {
      isSuccess: false,
      message: `Failed to get session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Delete a session by ID
 */
export async function deleteSessionAction(sessionId: string): Promise<ActionState<null>> {
  try {
    console.log(`[Action] Deleting session: ${sessionId}`);
    await setupDatabase();
    
    // First, get the session to obtain the project directory
    const session = await sessionRepository.getSession(sessionId);
    
    if (!session) {
      return {
        isSuccess: false,
        message: `Session with ID ${sessionId} not found`
      };
    }
    
    // Delete the session
    await sessionRepository.deleteSession(sessionId);
    
    // If the deleted session was the active one for its project, clear the active session
    if (session.projectDirectory) {
      console.log(`[Action] Checking if deleted session was active for project: ${session.projectDirectory}`);
      await setActiveSession(session.projectDirectory, null);
    }
    
    revalidatePath('/');
    
    return {
      isSuccess: true,
      message: "Session deleted successfully"
    };
  } catch (error) {
    console.error(`[deleteSessionAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to delete session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Clear all sessions
 */
export async function clearSessionsAction(): Promise<ActionState<null>> {
  try {
    console.log('[Action] Clearing all sessions');
    await setupDatabase();
    
    // Get all sessions to find unique project directories
    const allSessions = await sessionRepository.getAllSessions();
    const projectDirectories = [...new Set(allSessions.map(session => session.projectDirectory))];
    
    // Delete sessions for each project directory
    for (const projectDirectory of projectDirectories) {
      await sessionRepository.deleteAllSessions(projectDirectory);
    }
    
    revalidatePath('/');
    
    return {
      isSuccess: true,
      message: "All sessions cleared successfully"
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: `Failed to clear sessions: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Rename a session
 */
export async function renameSessionAction(sessionId: string, name: string): Promise<ActionState<null>> {
  try {
    console.log(`[Action] Renaming session ${sessionId} to: ${name}`);
    await setupDatabase();
    await sessionRepository.updateSessionName(sessionId, name);
    
    // Remove revalidatePath to prevent full page reloads
    // The UI will be updated client-side in the session-manager component
    
    return {
      isSuccess: true,
      message: "Session renamed successfully"
    };
  } catch (error) {
    console.error(`[renameSessionAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to rename session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Update a session's project directory
 */
export async function updateSessionProjectDirectoryAction(
  sessionId: string, 
  projectDirectory: string
): Promise<ActionState<null>> {
  try {
    console.log(`[Action] Updating project directory for session ${sessionId} to: ${projectDirectory}`);
    await setupDatabase();
    
    // Get the current session to check its project directory
    const session = await sessionRepository.getSession(sessionId);
    
    if (!session) {
      return {
        isSuccess: false,
        message: `Session with ID ${sessionId} not found`
      };
    }
    
    // If project directory is changing, we need to handle active sessions
    if (session.projectDirectory !== projectDirectory) {
      // Clear this session as active from the old project directory
      if (session.projectDirectory) {
        await setActiveSession(session.projectDirectory, null);
      }
      
      // Update the project directory
      await sessionRepository.updateSessionProjectDirectory(sessionId, projectDirectory);
      
      // Set this session as active for the new project directory
      await setActiveSession(projectDirectory, sessionId);
    } else {
      // Just update the project directory (no change to active sessions needed)
      await sessionRepository.updateSessionProjectDirectory(sessionId, projectDirectory);
    }
    
    revalidatePath('/');
    
    return {
      isSuccess: true,
      message: "Project directory updated successfully"
    };
  } catch (error) {
    console.error(`[updateSessionProjectDirectoryAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to update session project directory: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Save an existing session with the specified settings
 */
export async function saveSessionAction(
  sessionData: Partial<Session>,
  signal?: AbortSignal
): Promise<ActionState<Session>> {
  try {
    console.log(`[Action] Saving session: ${sessionData.id}`);
    
    // Don't check aborted status on the server directly
    // The AbortController signal cannot be accessed this way in server components
    
    await setupDatabase();
    
    if (!sessionData.id) {
      return {
        isSuccess: false,
        message: "Session ID is required"
      };
    }
    
    if (!sessionData.projectDirectory) {
      return {
        isSuccess: false,
        message: "Project directory is required"
      };
    }
    
    // Save the session
    const session = await sessionRepository.saveSession(sessionData as Session);
    
    // No revalidatePath to avoid full page reload
    
    return {
      isSuccess: true,
      data: session,
      message: "Session saved successfully"
    };
  } catch (error) {
    // Check if it's an abort error by name
    if (error instanceof Error && error.name === 'AbortError') {
      console.log(`[Action] Save session operation aborted for session ${sessionData.id}`);
      return {
        isSuccess: false,
        message: 'Operation aborted'
      };
    }
    
    console.error(`[saveSessionAction] Error:`, error);
    
    return {
      isSuccess: false,
      message: `Failed to save session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

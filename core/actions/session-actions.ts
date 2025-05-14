"use server";

import { sessionRepository, backgroundJobRepository } from '@core/lib/db/repositories';
import { setupDatabase } from '@core/lib/db';
import { ActionState } from '@core/types';
import { revalidatePath } from 'next/cache';
import { type Session } from '@core/types';
import { handleActionError } from '@core/lib/action-utils';
import { normalizePath } from '@core/lib/path-utils';
import { hashString } from '@core/lib/hash';

/**
 * Set the active session for a project
 */
export async function setActiveSessionAction(
  projectDirectory: string,
  sessionId: string | null
): Promise<ActionState<void>> {
  try {
    console.log(`[Action] Setting active session for project: ${projectDirectory} to: ${sessionId || 'null'}`);
    await setupDatabase();
    
    // Call directly into the database to set the active session
    await sessionRepository.setActiveSession(projectDirectory, sessionId);
    
    return {
      isSuccess: true,
      message: "Active session updated successfully"
    };
  } catch (error) {
    console.error(`[setActiveSessionAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to set active session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get the active session ID for a project
 */
export async function getActiveSessionIdAction(
  projectDirectory: string
): Promise<ActionState<string | null>> {
  try {
    console.log(`[Action] Getting active session ID for project: ${projectDirectory}`);
    await setupDatabase();
    
    const sessionId = await sessionRepository.getActiveSessionId(projectDirectory);
    
    return {
      isSuccess: true,
      data: sessionId,
      message: "Active session ID retrieved successfully"
    };
  } catch (error) {
    console.error(`[getActiveSessionIdAction] Error:`, error);
    return {
      isSuccess: false,
      message: `Failed to get active session ID: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

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
    
    // Find the latest job with an output file path
    const latestJobWithXml = session.backgroundJobs.find(job => job.outputFilePath);
    
    if (latestJobWithXml) {
      await backgroundJobRepository.updateBackgroundJobStatus({
        jobId: latestJobWithXml.id,
        status: latestJobWithXml.status,
        startTime: latestJobWithXml.startTime,
        endTime: latestJobWithXml.endTime,
        statusMessage: "XML file not found",
        metadata: {
          outputFilePath: null // Set output file path to null through metadata
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
): Promise<string | null> {
  try {
    console.log(`[Action] Creating new session: ${sessionData.name || 'Untitled'}`);
    
    await setupDatabase();
    
    if (!sessionData.projectDirectory) {
      console.error("[createSessionAction] Project directory is required");
      return null;
    }
    
    // Ensure session data has required fields for creation
    const completeSessionData = {
      ...sessionData,
      id: sessionData.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: sessionData.name || 'Untitled Session',
      taskDescription: sessionData.taskDescription || '',
      searchTerm: sessionData.searchTerm || '',
      titleRegex: sessionData.titleRegex || '',
      contentRegex: sessionData.contentRegex || '',
      negativeTitleRegex: sessionData.negativeTitleRegex || '',
      negativeContentRegex: sessionData.negativeContentRegex || '',
      isRegexActive: sessionData.isRegexActive !== undefined ? sessionData.isRegexActive : true,
      codebaseStructure: sessionData.codebaseStructure || '',
      includedFiles: sessionData.includedFiles || [],
      forceExcludedFiles: sessionData.forceExcludedFiles || [],
      searchSelectedFilesOnly: sessionData.searchSelectedFilesOnly !== undefined ? sessionData.searchSelectedFilesOnly : false,
      createdAt: sessionData.createdAt || Date.now(),
      modelUsed: sessionData.modelUsed || 'gemini-2.5-flash-preview-04-17',
      // Add projectHash if it's missing
      projectHash: sessionData.projectHash || hashString(sessionData.projectDirectory)
    } as Session;
    
    // Save the session directly using the repository
    const session = await sessionRepository.saveSession(completeSessionData);
    
    if (!session) {
      console.error("[createSessionAction] Failed to create session");
      return null;
    }
    
    // If this is a new session, automatically set it as the active session for the project
    if (session) {
      console.log(`[Action] Setting new session ${session.id} as active for project: ${session.projectDirectory}`);
      try {
        await sessionRepository.setActiveSession(session.projectDirectory, session.id);
      } catch (error) {
        console.warn(`[Action] Could not set active session, but session was created successfully:`, error);
        // Don't fail the whole operation if just setting the active session fails
      }
    }
    
    return session.id;
  } catch (error) {
    console.error(`[createSessionAction] Error:`, error);
    return null;
  }
}

/**
 * Get all sessions for a specific project
 */
export async function getSessionsAction(projectDirectory: string): Promise<Session[]> {
  try {
    if (!projectDirectory) {
      console.error(`[getSessionsAction] Invalid projectDirectory: ${projectDirectory}`);
      return [];
    }

    const normalizedProjectDir = normalizePath(projectDirectory);
    console.log(`[Action getSessionsAction] Received raw projectDir: "${projectDirectory}". Using normalized: "${normalizedProjectDir}" for repository call.`);

    await setupDatabase();

    // Use direct repository method instead of filtering all sessions
    const sessions = await sessionRepository.getSessionsForProject(normalizedProjectDir);

    console.log(`[Action] Found ${sessions.length} sessions for project: ${normalizedProjectDir}`);

    if (sessions.length === 0) {
      console.info(`[Action] No sessions found for project: ${normalizedProjectDir}. This could be normal for a new project.`);
    }

    return sessions;
  } catch (error) {
    console.error(`[getSessionsAction] Error retrieving sessions:`, error);
    return [];
  }
}

/**
 * Get a single session by ID
 */
export async function getSessionAction(sessionId: string): Promise<Session | null> {
  try {
    console.log(`[Action] Getting session: ${sessionId}`);
    
    await setupDatabase();
    const session = await sessionRepository.getSession(sessionId);
    
    if (!session) {
      console.error(`[getSessionAction] Session with ID ${sessionId} not found`);
      return null;
    }
    
    return session;
  } catch (error) {
    console.error(`[getSessionAction] Error:`, error);
    return null;
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
    
    // First, cancel any active background jobs associated with this session
    // This ensures they stop running (if they are) before deletion
    try {
      console.log(`[Action] Canceling active background jobs for session: ${sessionId}`);
      await backgroundJobRepository.cancelAllSessionBackgroundJobs(sessionId);

      // No need to explicitly delete the background jobs here
      // The deleteSession method will handle that with proper foreign key cascade
    } catch (error) {
      console.warn(`[Action] Error canceling background jobs for session ${sessionId}:`, error);
      // Continue with session deletion even if canceling jobs fails
    }
    
    // Delete the session directly and store the result
    const wasDeleted = await sessionRepository.deleteSession(sessionId);

    if (!wasDeleted) {
      return {
        isSuccess: false,
        message: `Session with ID ${sessionId} could not be deleted from database.`
      };
    }

    // If the deleted session was the active one for its project, clear the active session
    if (session.projectDirectory) {
      console.log(`[Action] Checking if deleted session was active for project: ${session.projectDirectory}`);
      try {
        await sessionRepository.setActiveSession(session.projectDirectory, null);
      } catch (error) {
        console.warn(`[Action] Could not clear active session, but session was deleted successfully:`, error);
        // Don't fail the whole operation if just clearing the active session fails
      }
    }

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
    
    // Call directly into repository
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
    
    // Get current session to get the old project directory
    const session = await sessionRepository.getSession(sessionId);
    
    if (!session) {
      return {
        isSuccess: false,
        message: `Session with ID ${sessionId} not found`
      };
    }
    
    const oldProjectDirectory = session.projectDirectory;
    
    // Update the project directory
    await sessionRepository.updateSessionProjectDirectory(sessionId, projectDirectory);
    
    // If this was the active session for the old project, clear it
    await sessionRepository.setActiveSession(oldProjectDirectory, null);
    
    // Set this as the active session for the new project directory
    await sessionRepository.setActiveSession(projectDirectory, sessionId);
    
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
  sessionData: Session
): Promise<ActionState<Session>> {
  try {
    console.log(`[Action] Saving session: ${sessionData.id}`);
    
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
    
    // Validate session data fields
    // Add any necessary validation from the old helpers.ts here
    
    // Ensure projectHash is set
    if (!sessionData.projectHash) {
      sessionData.projectHash = hashString(sessionData.projectDirectory);
    }
    
    // Save the session directly
    const session = await sessionRepository.saveSession(sessionData);
    
    // No revalidatePath to avoid full page reload
    
    return {
      isSuccess: true,
      data: session,
      message: "Session saved successfully"
    };
  } catch (error) {
    console.error(`[saveSessionAction] Error:`, error);
    
    return {
      isSuccess: false,
      message: `Failed to save session: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Implementation of validation logic from the old helpers.ts
 */
function validateSessionData(sessionData: Partial<Session>): string | undefined {
  // Check if task description is provided and is a string
  if (sessionData.taskDescription !== undefined && typeof sessionData.taskDescription !== 'string') {
    return 'Task description must be a string';
  }
  
  // Check if searchTerm is provided and is a string
  if (sessionData.searchTerm !== undefined && typeof sessionData.searchTerm !== 'string') {
    return 'Search term must be a string';
  }
  
  // Check if titleRegex is provided and is a string
  if (sessionData.titleRegex !== undefined && typeof sessionData.titleRegex !== 'string') {
    return 'Title regex must be a string';
  }
  
  // Check if contentRegex is provided and is a string
  if (sessionData.contentRegex !== undefined && typeof sessionData.contentRegex !== 'string') {
    return 'Content regex must be a string';
  }
  
  // Check if includedFiles is provided and is an array of strings
  if (sessionData.includedFiles !== undefined) {
    if (!Array.isArray(sessionData.includedFiles)) {
      return 'Included files must be an array';
    }
    
    // Check that all items in the array are strings
    if (sessionData.includedFiles.some(file => typeof file !== 'string')) {
      return 'Included files must be an array of strings';
    }
  }
  
  // Check if forceExcludedFiles is provided and is an array of strings
  if (sessionData.forceExcludedFiles !== undefined) {
    if (!Array.isArray(sessionData.forceExcludedFiles)) {
      return 'Force excluded files must be an array';
    }
    
    // Check that all items in the array are strings
    if (sessionData.forceExcludedFiles.some(file => typeof file !== 'string')) {
      return 'Force excluded files must be an array of strings';
    }
  }
  
  // Check codebaseStructure if provided
  if (sessionData.codebaseStructure !== undefined && typeof sessionData.codebaseStructure !== 'string') {
    return 'Codebase structure must be a string';
  }

  // Check projectDirectory if provided
  if (sessionData.projectDirectory !== undefined && typeof sessionData.projectDirectory !== 'string') {
    return 'Project directory must be a string';
  }
  
  // Check negativeTitleRegex if provided
  if (sessionData.negativeTitleRegex !== undefined && typeof sessionData.negativeTitleRegex !== 'string') {
    return 'Negative title regex must be a string';
  }
  
  // Check negativeContentRegex if provided
  if (sessionData.negativeContentRegex !== undefined && typeof sessionData.negativeContentRegex !== 'string') {
    return 'Negative content regex must be a string';
  }
  
  // Check isRegexActive if provided
  if (sessionData.isRegexActive !== undefined && typeof sessionData.isRegexActive !== 'boolean') {
    return 'Is regex active must be a boolean';
  }
  
  // Check searchSelectedFilesOnly if provided
  if (sessionData.searchSelectedFilesOnly !== undefined && typeof sessionData.searchSelectedFilesOnly !== 'boolean') {
    return 'Search selected files only must be a boolean';
  }
  
  // All validations passed
  return undefined;
}
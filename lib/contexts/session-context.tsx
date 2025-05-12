"use client";

/**
 * SessionContext - Manages session state for the active session
 *
 * This context provides the single source of truth for the current session state
 * in the client. It syncs with the database via server actions using a direct persistence approach
 * without complex debouncing or delayed saving mechanisms.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef
} from 'react';
import { Session } from '@/types';
import { useActiveSession } from '@/lib/hooks/use-active-session';
import { useProject } from './project-context';
import { useUILayout } from './ui-layout-context';
import {
  createSessionAction,
  getSessionAction,
  saveSessionAction,
  deleteSessionAction,
  renameSessionAction
} from '@/actions/session-actions';
import { DatabaseError, DatabaseErrorCategory, DatabaseErrorSeverity } from '@/lib/db/database-errors';

interface SessionContextType {
  // Session state
  currentSession: Session | null;
  setCurrentSession: (session: Session | null) => void;

  // Loading state
  isSessionLoading: boolean;
  setSessionLoading: (loading: boolean) => void;

  // Session modification tracking
  isSessionModified: boolean;
  setSessionModified: (modified: boolean) => void;

  // Active session ID management
  activeSessionId: string | null;
  setActiveSessionId: (sessionId: string | null) => void;

  // Session transition state
  isTransitioningSession: boolean;

  // Session field updates
  updateCurrentSessionFields: <K extends keyof Session>(fields: Pick<Session, K>) => void;

  // Session operations
  saveCurrentSession: () => Promise<boolean>;
  flushSaves: () => Promise<boolean>; // Method to flush pending saves immediately
  loadSession: (sessionId: string, options?: { force?: boolean }) => Promise<void>;
  createNewSession: (name: string, initialState: Partial<Session>) => Promise<string | null>;
  deleteActiveSession: () => Promise<void>;
  deleteNonActiveSession: (sessionId: string) => Promise<void>;
  renameActiveSession: (newName: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);


export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { projectDirectory, isLoading: isProjectLoading } = useProject();
  const { setAppInitializing } = useUILayout();

  // Use the activeSession hook to manage the active session ID
  const {
    activeSessionId,
    setActiveSessionIdGlobally
  } = useActiveSession(projectDirectory || '');

  // Session and loading state
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isSessionLoading, setSessionLoading] = useState<boolean>(false);
  const [isSessionModified, setSessionModified] = useState<boolean>(false);
  const [isTransitioningSession, setIsTransitioningSession] = useState<boolean>(false);

  // Track errors that occur during session operations
  const [sessionError, setSessionError] = useState<Error | null>(null);

  // Track if we've completed initialization
  const hasCompletedInitRef = useRef<boolean>(false);

  // Create refs for currentSession and isSessionModified to stabilize callback dependencies
  const currentSessionRef = useRef(currentSession);
  const isSessionModifiedRef = useRef(isSessionModified);

  // Keep refs updated with latest values
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    isSessionModifiedRef.current = isSessionModified;
  }, [isSessionModified]);
  
  
  // Handle saving the current session - returns boolean success for use with flushSaves
  const saveCurrentSession = useCallback(async (): Promise<boolean> => {
    // Use refs to get latest values without causing dependency changes
    const session = currentSessionRef.current;
    const modified = isSessionModifiedRef.current;

    // Check both currentSession and projectDirectory at the very beginning
    if (!session || !projectDirectory) {
      console.error(`[SessionContext] Cannot save: ${!session ? 'No active session' : 'No project directory'}`);
      return false;
    }

    if (!modified) {
      console.log('[SessionContext] Session not modified, skipping save');
      return true; // Return true since there's nothing to save (success)
    }

    // Add a log marker for easier tracing in console
    const marker = Math.random().toString(36).substring(2, 8);
    console.log(`[SessionContext:save:${marker}] Saving session ${session.id}`);

    try {
      // Double-check that currentSession is still valid before calling saveSessionAction
      // This handles race conditions where currentSession might become null due to concurrent state updates
      if (!session) {
        console.error(`[SessionContext:save:${marker}] Race condition detected: currentSession is now null`);
        return false;
      }

      // Always save immediately via the action
      await saveSessionAction(session);
      console.log(`[SessionContext:save:${marker}] Successfully saved session ${session.id}`);

      // Mark the session as no longer modified after successful save
      setSessionModified(false);

      // Emit a custom event for coordination with other components
      const event = new CustomEvent('session-save-complete', {
        detail: { sessionId: session.id }
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(event);
      }

      return true;
    } catch (error) {
      // Create appropriate database error
      const dbError = error instanceof DatabaseError
        ? error
        : new DatabaseError(
            `Error saving session: ${error instanceof Error ? error.message : String(error)}`,
            {
              originalError: error,
              category: DatabaseErrorCategory.OTHER,
              severity: DatabaseErrorSeverity.WARNING,
              context: { sessionId: session.id }
            }
          );

      console.error(`[SessionContext:save:${marker}] Error saving session:`, dbError.toString());
      setSessionError(dbError);

      // Emit a failure event
      if (typeof window !== 'undefined') {
        const failureEvent = new CustomEvent('session-save-failed', {
          detail: {
            sessionId: session.id,
            error: dbError.message
          }
        });
        window.dispatchEvent(failureEvent);
      }

      return false;
    }
  }, [projectDirectory]); // Only projectDirectory is a dependency now

  // flushSaves is now just an alias for saveCurrentSession for API compatibility
  // Direct reference to saveCurrentSession as flushSaves
  const flushSaves = saveCurrentSession;
  
  // Update specific fields in the current session
  const updateCurrentSessionFields = useCallback(<K extends keyof Session>(
    fields: Pick<Session, K>
  ) => {
    setCurrentSession((prevSession) => {
      if (!prevSession) return null;

      // Create a new session object with updated fields
      const updatedSession = {
        ...prevSession,
        ...fields
      };

      // Mark the session as modified
      setSessionModified(true);

      return updatedSession;
    });
  }, []);

  // Track ongoing session loads to prevent re-entrant calls
  const loadingSessionRef = React.useRef<{id: string | null, timestamp: number}>({id: null, timestamp: 0});

  // Consolidated loadSession function that handles both regular and force reloads
  const loadSession = useCallback(async (sessionId: string, options?: { force?: boolean }) => {
    if (!sessionId) {
      console.error('[SessionContext] Cannot load: Missing session ID');
      return;
    }

    if (!projectDirectory) {
      console.error('[SessionContext] Cannot load: Missing project directory');
      return;
    }

    // Use refs to get latest values without causing dependency changes
    const currentSession = currentSessionRef.current;
    const modified = isSessionModifiedRef.current;
    const isForceReload = options?.force === true;

    // Check if we already have this session loaded to prevent unnecessary reloads
    // Skip this check if force reload is requested
    if (currentSession?.id === sessionId && !modified && !isForceReload) {
      console.log(`[SessionContext] Session ${sessionId} already loaded and not modified, skipping reload`);
      return;
    }

    if (isForceReload) {
      console.log(`[SessionContext] Force reload requested for session ${sessionId}`);
    }

    // Prevent re-entrant calls for the same session ID
    const now = Date.now();
    const loadingData = loadingSessionRef.current;

    if (loadingData.id === sessionId && (now - loadingData.timestamp) < 3000) {
      console.log(`[SessionContext] Preventing re-entrant load for session ${sessionId}`);
      return;
    }

    // Update loading session reference
    loadingSessionRef.current = {id: sessionId, timestamp: now};

    // Add a unique marker for tracing this specific load operation in logs
    const marker = Math.random().toString(36).substring(2, 8);
    console.log(`[SessionContext:load:${marker}] Starting load of session: ${sessionId}`);

    // IMPORTANT: IMMEDIATELY set transitioning state to signal a session is being switched
    setIsTransitioningSession(true);
    // IMMEDIATELY set loading state
    setSessionLoading(true);

    // IMMEDIATELY set the internal activeSessionId state
    // Use setActiveSessionIdGlobally directly to avoid circular dependency
    setActiveSessionIdGlobally(sessionId);

    const existingProjectDir = currentSession?.projectDirectory || projectDirectory;
    const previousTaskDescription = currentSession?.taskDescription || '';
    const previousFiles = currentSession?.includedFiles || [];
    const previousExcludes = currentSession?.forceExcludedFiles || [];

    const minimalSessionShell: Session = {
      id: sessionId,
      projectDirectory: existingProjectDir,
      name: 'Loading...',
      taskDescription: previousTaskDescription,
      includedFiles: previousFiles,
      forceExcludedFiles: previousExcludes,
      searchTerm: currentSession?.searchTerm || '',
      searchSelectedFilesOnly: currentSession?.searchSelectedFilesOnly || false,
      titleRegex: currentSession?.titleRegex || '',
      isRegexActive: currentSession?.isRegexActive || true,
      negativeTitleRegex: currentSession?.negativeTitleRegex || '',
      negativeContentRegex: currentSession?.negativeContentRegex || '',
      contentRegex: currentSession?.contentRegex || '',
      codebaseStructure: currentSession?.codebaseStructure || '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // CRUCIAL: Set currentSession to this minimal shell object BEFORE fetching data
    // This immediately signals that the session is changing
    setCurrentSession(minimalSessionShell);

    // Save previous session ID for event coordination
    const previousSessionId = currentSession?.id !== sessionId ? currentSession?.id : null;
    let loadSuccess = false;

    try {
      // Before loading new session data, ensure any pending saves for previous session are flushed
      if (previousSessionId && modified) {
        console.log(`[SessionContext:load:${marker}] Saving previous session before loading new one: ${previousSessionId}`);
        try {
          await saveCurrentSession();
          console.log(`[SessionContext:load:${marker}] Successfully saved previous session: ${previousSessionId}`);
        } catch (saveError) {
          console.warn(`[SessionContext:load:${marker}] Error saving previous session:`, saveError);
          // Continue with the load even if the save fails
        }
      }

      // Emit an event that we're starting a session load
      if (typeof window !== 'undefined' && !isFirstLoadRef.current) {
        const startEvent = new CustomEvent('session-load-start', {
          detail: {
            sessionId,
            previousSessionId
          }
        });
        window.dispatchEvent(startEvent);
      } else if (isFirstLoadRef.current) {
        console.log(`[SessionContext:load:${marker}] First load detected, skipping session-load-start event`);
      }

      // Now fetch the requested session
      console.log(`[SessionContext:load:${marker}] Fetching session data from server: ${sessionId}`);
      const fetchedSession = await getSessionAction(sessionId);

      if (!fetchedSession) {
        throw new DatabaseError(`Session not found: ${sessionId}`, {
          severity: DatabaseErrorSeverity.WARNING,
          category: DatabaseErrorCategory.QUERY,
          context: { sessionId },
          reportToUser: true
        });
      }

      // Validate the session includes expected fields like taskDescription
      if (!fetchedSession.taskDescription && fetchedSession.taskDescription !== '') {
        console.warn(`[SessionContext:load:${marker}] Session ${sessionId} is missing taskDescription field`);
        // Ensure taskDescription exists, even if it's just an empty string
        fetchedSession.taskDescription = fetchedSession.taskDescription || '';
      }

      // Update the current session with the complete fetched data
      console.log(`[SessionContext:load:${marker}] Session data received, updating state: ${sessionId}`);
      setCurrentSession(fetchedSession);
      setSessionModified(false);

      loadSuccess = true;
      console.log(`[SessionContext:load:${marker}] Session ${sessionId} loaded successfully`);

      // Emit a success event for session load
      if (typeof window !== 'undefined' && !isFirstLoadRef.current) {
        const successEvent = new CustomEvent('session-load-complete', {
          detail: {
            sessionId,
            previousSessionId,
            success: true
          }
        });
        window.dispatchEvent(successEvent);
      } else if (isFirstLoadRef.current) {
        // For first load, mark that we're no longer in first load mode
        isFirstLoadRef.current = false;
        console.log(`[SessionContext:load:${marker}] First load completed, future loads will emit events`);
      }

    } catch (error) {
      // Create appropriate database error
      const dbError = error instanceof DatabaseError
        ? error
        : new DatabaseError(
            `Error loading session: ${error instanceof Error ? error.message : String(error)}`,
            {
              originalError: error,
              category: DatabaseErrorCategory.QUERY,
              severity: DatabaseErrorSeverity.WARNING,
              context: { sessionId },
              reportToUser: true
            }
          );

      console.error(`[SessionContext:load:${marker}] Error loading session:`, dbError.toString());
      setSessionError(dbError);

      // Emit a failure event - skip for first load
      if (typeof window !== 'undefined' && !isFirstLoadRef.current) {
        const failureEvent = new CustomEvent('session-load-failed', {
          detail: {
            sessionId,
            previousSessionId,
            error: dbError.message
          }
        });
        window.dispatchEvent(failureEvent);
      } else if (isFirstLoadRef.current) {
        // Still mark first load as complete even on failure
        isFirstLoadRef.current = false;
        console.log(`[SessionContext:load:${marker}] First load failed, but still marking as complete`);
      }

      // Re-throw to allow caller to handle error
      throw dbError;
    } finally {
      // Always clear loading and transitioning states
      setSessionLoading(false);
      setIsTransitioningSession(false);
      console.log(`[SessionContext:load:${marker}] Loading and transitioning states cleared for session ${sessionId}`);

      // Clear the loading session reference if this is the session we're loading
      if (loadingSessionRef.current.id === sessionId) {
        loadingSessionRef.current = {id: null, timestamp: 0};
      }

      // Log completion regardless of success
      console.log(`[SessionContext:load:${marker}] Load operation completed for session ${sessionId}, success=${loadSuccess}`);
    }
  }, [saveCurrentSession, projectDirectory, setSessionLoading, setCurrentSession, setSessionModified, setIsTransitioningSession, setSessionError, setActiveSessionIdGlobally]);

  // Create a new session
  const createNewSession = useCallback(async (
    name: string,
    initialState: Partial<Session>
  ): Promise<string | null> => {
    if (!projectDirectory) {
      console.error('[SessionContext] Cannot create session: Missing project directory');
      return null;
    }

    try {
      // Save the current session first if it's modified
      if (currentSession && isSessionModified) {
        await saveCurrentSession();
      }

      // Prepare the new session data
      const sessionData: Partial<Session> = {
        ...initialState,
        name,
        projectDirectory
      };

      // Create the session using the server action
      const newSessionId = await createSessionAction(sessionData);

      if (!newSessionId) {
        throw new DatabaseError('Failed to create new session', {
          severity: DatabaseErrorSeverity.WARNING,
          category: DatabaseErrorCategory.OTHER,
          context: { name, projectDirectory },
          reportToUser: true
        });
      }

      // Load the newly created session using our consolidated loadSession function
      // This function handles setting transition states properly
      await loadSession(newSessionId);

      return newSessionId;
    } catch (error) {
      // Create appropriate database error
      const dbError = error instanceof DatabaseError
        ? error
        : new DatabaseError(
            `Error creating session: ${error instanceof Error ? error.message : String(error)}`,
            {
              originalError: error,
              category: DatabaseErrorCategory.OTHER,
              severity: DatabaseErrorSeverity.WARNING,
              context: { name, projectDirectory },
              reportToUser: true
            }
          );

      console.error('[SessionContext] Error creating session:', dbError.toString());
      setSessionError(dbError);
      return null;
    }
  }, [projectDirectory, currentSession, isSessionModified, saveCurrentSession, loadSession]);
  
  // Delete the active session
  const deleteActiveSession = useCallback(async () => {
    if (!currentSession?.id) {
      console.error('[SessionContext] Cannot delete: No active session');
      return;
    }

    try {
      const sessionIdToDelete = currentSession.id;

      // Delete the session using server action and check the result
      const result = await deleteSessionAction(sessionIdToDelete);

      if (!result.isSuccess) {
        throw new DatabaseError(result.message || 'Failed to delete active session', {
          severity: DatabaseErrorSeverity.WARNING,
          category: DatabaseErrorCategory.OTHER,
          context: { sessionId: sessionIdToDelete },
          reportToUser: true
        });
      }

      // Clear the current session state
      setCurrentSession(null);
      setSessionModified(false);

      // Clear the active session ID globally
      await setActiveSessionIdGlobally(null);

      console.log(`[SessionContext] Session ${sessionIdToDelete} deleted successfully`);
    } catch (error) {
      // Create appropriate database error
      const dbError = error instanceof DatabaseError 
        ? error 
        : new DatabaseError(
            `Error deleting session: ${error instanceof Error ? error.message : String(error)}`,
            {
              originalError: error,
              category: DatabaseErrorCategory.OTHER,
              severity: DatabaseErrorSeverity.WARNING,
              context: { sessionId: currentSession.id },
              reportToUser: true
            }
          );
          
      console.error('[SessionContext] Error deleting session:', dbError.toString());
      setSessionError(dbError);
      throw dbError; // Re-throw to allow SessionManager to handle UI notifications
    }
  }, [currentSession, setActiveSessionIdGlobally]);

  // Delete a non-active session
  const deleteNonActiveSession = useCallback(async (sessionIdToDelete: string) => {
    if (!sessionIdToDelete) {
      console.error('[SessionContext] Cannot delete: Missing session ID');
      setSessionError(new Error('Missing session ID for deletion'));
      return;
    }
    try {
      const result = await deleteSessionAction(sessionIdToDelete);

      if (!result.isSuccess) {
        throw new DatabaseError(result.message || 'Failed to delete non-active session', {
          severity: DatabaseErrorSeverity.WARNING,
          category: DatabaseErrorCategory.OTHER,
          context: { sessionId: sessionIdToDelete },
          reportToUser: true
        });
      }

      // No need to change activeSessionId or currentSession here
      // as we are deleting a non-active session.
      // The list will be refreshed by the caller (SessionManager).
      console.log(`[SessionContext] Non-active session ${sessionIdToDelete} deleted successfully`);
    } catch (error) {
      // Create appropriate database error
      const dbError = error instanceof DatabaseError 
        ? error 
        : new DatabaseError(
            `Error deleting non-active session: ${error instanceof Error ? error.message : String(error)}`,
            {
              originalError: error,
              category: DatabaseErrorCategory.OTHER,
              severity: DatabaseErrorSeverity.WARNING,
              context: { sessionId: sessionIdToDelete },
              reportToUser: true
            }
          );
      
      console.error('[SessionContext] Error deleting non-active session:', dbError.toString());
      setSessionError(dbError);
      // Re-throw to allow SessionManager to handle UI notifications
      throw dbError;
    }
  }, []);
  
  // Rename the active session
  const renameActiveSession = useCallback(async (newName: string) => {
    if (!currentSession?.id) {
      console.error('[SessionContext] Cannot rename: No active session');
      return;
    }

    try {
      // Update the name in the local state
      updateCurrentSessionFields({ name: newName });

      // Rename the session using server action and immediately save changes
      await renameSessionAction(currentSession.id, newName);
      await saveCurrentSession();

      console.log(`[SessionContext] Session ${currentSession.id} renamed to "${newName}"`);
    } catch (error) {
      // Create appropriate database error
      const dbError = error instanceof DatabaseError 
        ? error 
        : new DatabaseError(
            `Error renaming session: ${error instanceof Error ? error.message : String(error)}`,
            {
              originalError: error,
              category: DatabaseErrorCategory.OTHER,
              severity: DatabaseErrorSeverity.WARNING,
              context: { sessionId: currentSession.id, newName },
              reportToUser: true
            }
          );
      
      console.error('[SessionContext] Error renaming session:', dbError.toString());
      setSessionError(dbError);
    }
  }, [currentSession, updateCurrentSessionFields, saveCurrentSession]);
  
  // Set the active session ID
  const setActiveSessionId = useCallback(async (sessionId: string | null) => {
    if (!projectDirectory) {
      console.error('[SessionContext] Cannot set active session: Missing project directory');
      return;
    }

    try {
      // If the active session ID is being cleared, clear the current session
      if (sessionId === null) {
        setCurrentSession(null);
        setSessionModified(false);
        await setActiveSessionIdGlobally(null);
        return;
      }

      // Update the active session ID globally
      await setActiveSessionIdGlobally(sessionId);

      // Note: We don't immediately call loadSession here to avoid circular dependencies.
      // The useEffect for activeSessionId changes will handle loading the session if needed.
      console.log(`[SessionContext] Active session ID set to ${sessionId}, waiting for effect to load if needed`);
    } catch (error) {
      // Create appropriate database error
      const dbError = error instanceof DatabaseError
        ? error
        : new DatabaseError(
            `Error setting active session ID: ${error instanceof Error ? error.message : String(error)}`,
            {
              originalError: error,
              category: DatabaseErrorCategory.OTHER,
              severity: DatabaseErrorSeverity.WARNING,
              context: { sessionId, projectDirectory }
            }
          );

      console.error('[SessionContext] Error setting active session ID:', dbError.toString());
      setSessionError(dbError);
    }
  }, [
    projectDirectory,
    setActiveSessionIdGlobally
  ]);
  

  // Track if this is the very first load of the app
  const isFirstLoadRef = useRef<boolean>(true);
  // Track which specific session ID has completed initial load via the main effect
  const initialLoadCompletedForActiveIdRef = useRef<string | null>(null);

  // Primary effect for handling app initialization and session auto-loading
  useEffect(() => {
    // 1. First check if project is still loading
    if (isProjectLoading) {
      console.log('[SessionContext] Waiting for project to finish loading before initializing');
      return;
    }

    // 2. If project is loaded but missing directory, we can initialize immediately
    if (!projectDirectory) {
      console.log('[SessionContext] No project directory available, completing initialization');
      setAppInitializing(false);
      initialLoadCompletedForActiveIdRef.current = null; // Reset completion tracking
      return;
    }

    // 3. Project directory is loaded, now handle session initialization
    if (!activeSessionId) {
      console.log('[SessionContext] Project loaded but no active session ID, completing initialization');
      setAppInitializing(false);
      initialLoadCompletedForActiveIdRef.current = null; // Reset completion tracking
      return;
    }

    // 4. Check if we've already completed initial load for this specific session ID
    if (initialLoadCompletedForActiveIdRef.current === activeSessionId) {
      console.log(`[SessionContext] Initial load already completed for session ${activeSessionId}, skipping reload`);
      setAppInitializing(false);
      return;
    }

    // 5. If we already have this session loaded, complete initialization
    if (currentSessionRef.current?.id === activeSessionId) {
      console.log(`[SessionContext] Session ${activeSessionId} already loaded, completing initialization`);
      setAppInitializing(false);
      initialLoadCompletedForActiveIdRef.current = activeSessionId; // Mark as completed
      return;
    }

    // 6. Need to load the session - only if not already loading
    if (!isSessionLoading) {
      console.log(`[SessionContext] Loading session ${activeSessionId} to complete initialization`);

      // Track the session we're attempting to load to prevent duplicates
      const sessionToLoad = activeSessionId;

      // Track that we're initiating a load for this session ID
      initialLoadCompletedForActiveIdRef.current = activeSessionId;

      // Load the session with explicit initialization completion
      // Use our consolidated loadSession function which handles transitions properly
      loadSession(sessionToLoad)
        .catch(error => {
          console.error('[SessionContext] Error loading session during initialization:', error);
        })
        .finally(() => {
          // ALWAYS complete app initialization, even if session loading failed
          console.log('[SessionContext] Finalizing app initialization after session load attempt');
          setAppInitializing(false);
        });
    } else {
      console.log('[SessionContext] Session already loading, waiting for completion');
    }
  }, [
    projectDirectory,
    isProjectLoading,
    activeSessionId,
    isSessionLoading,
    loadSession,
    setAppInitializing
  ]); // Using loadSession instead of loadSessionById

  // DISABLED: Auto-save the session when the component unmounts
  // This feature was causing an infinite re-render cycle so we've completely disabled it
  useEffect(() => {
    // Store references to the values in a variable to preserve the unmount logic
    // while avoiding dependency updates
    const cleanup = {
      logSkippedSave: () => {
        if (currentSession && isSessionModified && projectDirectory) {
          console.log(
            `[SessionContext] DISABLED: Session save during unmount was skipped for ${currentSession.id} to prevent freeze`
          );
        }
      }
    };

    return () => {
      cleanup.logSkippedSave();
      // No saves during unmount - all saves will happen via explicit user interactions
    };
  // We're intentionally leaving this empty to avoid triggering the effect on value changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const contextValue = {
    currentSession,
    setCurrentSession,
    isSessionLoading,
    setSessionLoading,
    isSessionModified,
    setSessionModified,
    activeSessionId,
    setActiveSessionId,
    isTransitioningSession,
    updateCurrentSessionFields,
    saveCurrentSession,
    flushSaves,
    loadSession, // Use our consolidated loadSession function
    createNewSession,
    deleteActiveSession,
    deleteNonActiveSession,
    renameActiveSession
  };
  
  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
};

/**
 * Hook to access the SessionContext
 * @returns The SessionContext value
 * @throws Error if used outside SessionProvider
 */
export function useSessionContext() {
  const context = useContext(SessionContext);
  
  if (context === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  
  return context;
}
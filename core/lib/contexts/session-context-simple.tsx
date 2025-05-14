"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef
} from 'react';
import { Session } from '@core/types';
import { useActiveSession } from '@core/lib/hooks/use-active-session';
import { useProject } from './project-context';
import { useUILayout } from './ui-layout-context';
import {
  createSessionAction,
  getSessionAction,
  saveSessionAction,
  deleteSessionAction,
  renameSessionAction
} from '@core/actions/session-actions';
import { DatabaseError, DatabaseErrorCategory, DatabaseErrorSeverity } from '@core/lib/db/database-errors';

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

  // Session field updates
  updateCurrentSessionFields: <K extends keyof Session>(fields: Pick<Session, K>) => void;

  // Session operations
  saveCurrentSession: () => Promise<boolean>;
  flushSaves: () => Promise<boolean>; 
  loadSessionById: (sessionId: string) => Promise<void>;
  createNewSession: (name: string, initialState: Partial<Session>) => Promise<string | null>;
  deleteActiveSession: () => Promise<void>;
  deleteNonActiveSession: (sessionId: string) => Promise<void>;
  renameActiveSession: (newName: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { projectDirectory } = useProject();
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
  
  // Track errors that occur during session operations
  const [sessionError, setSessionError] = useState<Error | null>(null);
  
  // Track if we've completed initialization
  const hasCompletedInitRef = useRef<boolean>(false);
  
  // Handle saving the current session
  const saveCurrentSession = useCallback(async (): Promise<boolean> => {
    if (!currentSession || !projectDirectory) {
      return false;
    }

    if (!isSessionModified) {
      return true; 
    }

    try {
      if (!currentSession) {
        return false;
      }

      await saveSessionAction(currentSession);
      setSessionModified(false);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-save-complete', {
          detail: { sessionId: currentSession.id }
        }));
      }

      return true;
    } catch (error) {
      const dbError = error instanceof DatabaseError 
        ? error 
        : new DatabaseError(
            `Error saving session: ${error instanceof Error ? error.message : String(error)}`,
            {
              originalError: error,
              category: DatabaseErrorCategory.OTHER,
              severity: DatabaseErrorSeverity.WARNING,
              context: { sessionId: currentSession.id }
            }
          );
      
      setSessionError(dbError);
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-save-failed', {
          detail: { 
            sessionId: currentSession.id,
            error: dbError.message
          }
        }));
      }
      
      return false;
    }
  }, [currentSession, isSessionModified, projectDirectory]);

  // Direct reference to saveCurrentSession as flushSaves
  const flushSaves = saveCurrentSession;
  
  // Update specific fields in the current session
  const updateCurrentSessionFields = useCallback(<K extends keyof Session>(
    fields: Pick<Session, K>
  ) => {
    setCurrentSession((prevSession) => {
      if (!prevSession) return null;
      setSessionModified(true);
      return { ...prevSession, ...fields };
    });
  }, []);
  
  // Track ongoing session loads to prevent re-entrant calls
  const loadingSessionRef = useRef<{id: string | null, timestamp: number}>({id: null, timestamp: 0});

  // Load a session by ID
  const loadSessionById = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      if (!hasCompletedInitRef.current) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
      return;
    }

    if (!projectDirectory) {
      if (!hasCompletedInitRef.current) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
      return;
    }

    if (currentSession?.id === sessionId && !isSessionModified) {
      if (!hasCompletedInitRef.current) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
      return;
    }

    const now = Date.now();
    const loadingData = loadingSessionRef.current;

    if (loadingData.id === sessionId && (now - loadingData.timestamp) < 3000) {
      return;
    }

    loadingSessionRef.current = {id: sessionId, timestamp: now};
    setSessionLoading(true);

    const previousSessionId = currentSession?.id;
    let loadSuccess = false;

    // Create a safety timeout - reduced to 2 seconds
    const safetyTimeout = setTimeout(() => {
      setSessionLoading(false);
      loadingSessionRef.current = {id: null, timestamp: 0};
      
      if (typeof window !== 'undefined' && !loadSuccess) {
        window.dispatchEvent(new CustomEvent('session-load-failed', {
          detail: {
            sessionId,
            previousSessionId,
            error: 'Session load timed out'
          }
        }));
      }
      
      if (!hasCompletedInitRef.current) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
    }, 2000); // 2 seconds timeout

    try {
      if (currentSession && isSessionModified && currentSession.id !== sessionId) {
        await saveCurrentSession();
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-load-start', {
          detail: {
            sessionId,
            previousSessionId
          }
        }));
      }

      const session = await getSessionAction(sessionId);

      if (!session) {
        throw new DatabaseError(`Session not found: ${sessionId}`, {
          severity: DatabaseErrorSeverity.WARNING,
          category: DatabaseErrorCategory.QUERY,
          context: { sessionId },
          reportToUser: true
        });
      }

      if (!session.taskDescription && session.taskDescription !== '') {
        session.taskDescription = session.taskDescription || '';
      }

      setCurrentSession(session);
      setSessionModified(false);
      loadSuccess = true;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-load-complete', {
          detail: {
            sessionId,
            previousSessionId,
            success: true
          }
        }));
      }
      
      if (!hasCompletedInitRef.current) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
    } catch (error) {
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
      
      setSessionError(dbError);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-load-failed', {
          detail: {
            sessionId,
            previousSessionId,
            error: dbError.message
          }
        }));
      }
      
      if (!hasCompletedInitRef.current) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }

      throw dbError;
    } finally {
      clearTimeout(safetyTimeout);
      setSessionLoading(false);
      
      if (loadingSessionRef.current.id === sessionId) {
        loadingSessionRef.current = {id: null, timestamp: 0};
      }
    }
  }, [currentSession, isSessionModified, saveCurrentSession, projectDirectory, setAppInitializing]);
  
  // Create a new session
  const createNewSession = useCallback(async (
    name: string, 
    initialState: Partial<Session>
  ): Promise<string | null> => {
    if (!projectDirectory) {
      return null;
    }
    
    try {
      if (currentSession && isSessionModified) {
        await saveCurrentSession();
      }
      
      const sessionData: Partial<Session> = {
        ...initialState,
        name,
        projectDirectory
      };
      
      const newSessionId = await createSessionAction(sessionData);
      
      if (!newSessionId) {
        throw new DatabaseError('Failed to create new session', {
          severity: DatabaseErrorSeverity.WARNING,
          category: DatabaseErrorCategory.OTHER,
          context: { name, projectDirectory },
          reportToUser: true
        });
      }
      
      await loadSessionById(newSessionId);
      
      return newSessionId;
    } catch (error) {
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
          
      setSessionError(dbError);
      return null;
    }
  }, [projectDirectory, currentSession, isSessionModified, saveCurrentSession, loadSessionById]);
  
  // Set the active session ID
  const setActiveSessionId = useCallback(async (sessionId: string | null) => {
    if (!projectDirectory) {
      return;
    }

    try {
      if (currentSession && isSessionModified && sessionId !== currentSession.id) {
        await saveCurrentSession();
      }

      if (sessionId === null) {
        setCurrentSession(null);
        setSessionModified(false);
      }

      await setActiveSessionIdGlobally(sessionId);
    } catch (error) {
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

      setSessionError(dbError);
    }
  }, [
    projectDirectory,
    currentSession,
    isSessionModified,
    saveCurrentSession,
    setActiveSessionIdGlobally
  ]);
  
  // Delete the active session
  const deleteActiveSession = useCallback(async () => {
    if (!currentSession?.id) {
      return;
    }

    try {
      const sessionIdToDelete = currentSession.id;
      const result = await deleteSessionAction(sessionIdToDelete);

      if (!result.isSuccess) {
        throw new DatabaseError(result.message || 'Failed to delete active session', {
          severity: DatabaseErrorSeverity.WARNING,
          category: DatabaseErrorCategory.OTHER,
          context: { sessionId: sessionIdToDelete },
          reportToUser: true
        });
      }

      setCurrentSession(null);
      setSessionModified(false);
      await setActiveSessionIdGlobally(null);
    } catch (error) {
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
          
      setSessionError(dbError);
      throw dbError;
    }
  }, [currentSession, setActiveSessionIdGlobally]);
  
  // Delete a non-active session
  const deleteNonActiveSession = useCallback(async (sessionIdToDelete: string) => {
    if (!sessionIdToDelete) {
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
    } catch (error) {
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
      
      setSessionError(dbError);
      throw dbError;
    }
  }, []);
  
  // Rename the active session
  const renameActiveSession = useCallback(async (newName: string) => {
    if (!currentSession?.id) {
      return;
    }

    try {
      updateCurrentSessionFields({ name: newName });
      await renameSessionAction(currentSession.id, newName);
      await saveCurrentSession();
    } catch (error) {
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
      
      setSessionError(dbError);
    }
  }, [currentSession, updateCurrentSessionFields, saveCurrentSession]);
  
  // Track active session loading state during initialization
  const initialAutoLoadCompleteRef = useRef<boolean>(false);
  const prevActiveSessionIdRef = useRef<string | null>(null);

  // Auto-load the active session when it changes
  useEffect(() => {
    // Skip if there's no projectDirectory or activeSessionId
    if (!projectDirectory || !activeSessionId) {
      // Complete initialization
      if (!initialAutoLoadCompleteRef.current && !hasCompletedInitRef.current) {
        initialAutoLoadCompleteRef.current = true;
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
      return;
    }

    // Skip conditions
    if (isSessionLoading || 
        currentSession?.id === activeSessionId || 
        activeSessionId === prevActiveSessionIdRef.current) {
      
      // Handle case where session is already loaded
      if (currentSession?.id === activeSessionId && !initialAutoLoadCompleteRef.current) {
        initialAutoLoadCompleteRef.current = true;
        
        // Complete initialization
        if (!hasCompletedInitRef.current) {
          hasCompletedInitRef.current = true;
          setAppInitializing(false);
        }
      }
      
      // Update reference even when skipping
      if (activeSessionId !== prevActiveSessionIdRef.current) {
        prevActiveSessionIdRef.current = activeSessionId;
      }
      
      return;
    }

    // First load handling
    if (!initialAutoLoadCompleteRef.current) {
      initialAutoLoadCompleteRef.current = true;
      prevActiveSessionIdRef.current = activeSessionId;
      
      setSessionLoading(true);
      loadSessionById(activeSessionId).catch(() => {
        setSessionLoading(false);

        // Complete initialization on error
        if (!hasCompletedInitRef.current) {
          hasCompletedInitRef.current = true;
          setAppInitializing(false);
        }
      });
      
      return;
    }

    // Normal subsequent loads
    prevActiveSessionIdRef.current = activeSessionId;
    loadSessionById(activeSessionId).catch(() => {});
    
  }, [activeSessionId, currentSession, loadSessionById, projectDirectory, isSessionLoading, setAppInitializing]);

  // Auto-save on unmount if modified
  useEffect(() => {
    return () => {
      if (currentSession && isSessionModified && projectDirectory) {
        saveSessionAction(currentSession).catch(() => {});
      }
    };
  }, [currentSession, isSessionModified, projectDirectory]);
  
  const contextValue = {
    currentSession,
    setCurrentSession,
    isSessionLoading,
    setSessionLoading,
    isSessionModified,
    setSessionModified,
    activeSessionId,
    setActiveSessionId,
    updateCurrentSessionFields,
    saveCurrentSession,
    flushSaves,
    loadSessionById,
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
 */
export function useSessionContext() {
  const context = useContext(SessionContext);
  
  if (context === undefined) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  
  return context;
}
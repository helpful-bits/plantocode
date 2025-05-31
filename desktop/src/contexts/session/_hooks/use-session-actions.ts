"use client";

import { useCallback, useRef, useMemo, useEffect } from "react";

import {
  createSessionAction,
  saveSessionAction,
  deleteSessionAction,
  renameSessionAction,
} from "@/actions";
import { areArraysEqual } from "@/utils/array-utils";
import { useProject } from "@/contexts/project-context";
import { useNotification } from "@/contexts/notification-context";
import { type Session } from "@/types";
import {
  DatabaseError,
  DatabaseErrorCategory,
  DatabaseErrorSeverity,
} from "@/types/error-types";
import { DRAFT_SESSION_ID } from "./use-session-state";

/**
 * Hook for session mutation actions and field updates
 * Focused solely on performing actions and updating immediate state
 */
export function useSessionActions({
  currentSession,
  isSessionModified,
  setCurrentSession,
  setSessionModified,
  setSessionError,
  setActiveSessionIdGlobally,
  onSessionNeedsReload,
}: {
  currentSession: Session | null;
  isSessionModified: boolean;
  setCurrentSession: (session: Session | null) => void;
  setSessionModified: (modified: boolean) => void;
  setSessionError: (error: Error | null) => void;
  setActiveSessionIdGlobally: (sessionId: string | null) => Promise<void>;
  onSessionNeedsReload?: (sessionId: string) => void;
}) {
  const { projectDirectory } = useProject();
  const { showNotification } = useNotification();
  
  // Debounce ref for auto-save functionality
  const autoSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Use refs to avoid stale closures in the debounced function
  const currentSessionRef = useRef(currentSession);
  const isSessionModifiedRef = useRef(isSessionModified);
  
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);
  
  useEffect(() => {
    isSessionModifiedRef.current = isSessionModified;
  }, [isSessionModified]);

  // Handle saving the current session
  const saveCurrentSession = useCallback(async (): Promise<boolean> => {
    if (!currentSessionRef.current || !projectDirectory) {
      return false;
    }

    if (!isSessionModifiedRef.current) {
      return true;
    }

    // Prevent saving draft sessions to database
    if (currentSessionRef.current.id === DRAFT_SESSION_ID) {
      console.warn(
        "[SessionActions] Attempted to save a draft session via saveCurrentSession. Drafts are persisted via createNewSession."
      );
      return true; // Considered 'saved' locally, no DB action
    }

    try {
      if (!currentSessionRef.current) {
        return false;
      }

      const result = await saveSessionAction(currentSessionRef.current);

      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to save session");
      }

      setSessionModified(false);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("session-save-complete", {
            detail: { sessionId: currentSessionRef.current.id },
          })
        );
      }

      return true;
    } catch (error) {
      const dbError =
        error instanceof DatabaseError
          ? error
          : new DatabaseError(
              `Error saving session: ${error instanceof Error ? error.message : String(error)}`,
              {
                originalError: error as unknown as Error | undefined,
                category: DatabaseErrorCategory.OTHER,
                severity: DatabaseErrorSeverity.WARNING,
                context: { sessionId: currentSessionRef.current?.id },
              }
            );

      setSessionError(dbError);
      
      // Show error notification
      showNotification({
        title: "Session Save Failed",
        message: dbError.message,
        type: "error",
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("session-save-failed", {
            detail: {
              sessionId: currentSessionRef.current?.id,
              error: dbError.message,
            },
          })
        );
      }

      return false;
    }
  }, [
    projectDirectory, // From useProject()
    setSessionModified, // Stable setter from SessionStateContext
    setSessionError, // Stable setter from SessionStateContext
    showNotification, // From NotificationContext, assumed stable
    // saveSessionAction is an external import, inherently stable
  ]);

  // Direct reference to saveCurrentSession as flushSaves
  const flushSaves = saveCurrentSession;
  
  // Debounced auto-save function
  const debouncedSaveCurrentSession = useCallback(() => {
    if (autoSaveDebounceRef.current) {
      clearTimeout(autoSaveDebounceRef.current);
    }
    
    autoSaveDebounceRef.current = setTimeout(() => {
      // Use refs to avoid stale closures
      if (currentSessionRef.current && isSessionModifiedRef.current) {
        void saveCurrentSession();
      }
    }, 2000); // 2 second debounce
  }, [
    saveCurrentSession, // Memoized function dependency
  ]);


  // Update specific fields in the current session
  const updateCurrentSessionFields = useCallback(
    (fields: Partial<Session>) => {
      // Using Session type for the function parameter ensures proper typing
      if (currentSessionRef.current) {
        let changed = false;
        const updatedFields: Partial<Session> = {};

        for (const key in fields) {
          const typedKey = key as keyof Session;
          const fieldValue = fields[typedKey];
          if (fieldValue !== undefined && fieldValue !== currentSessionRef.current[typedKey]) {
            // For arrays, do a shallow content comparison
            if (Array.isArray(fieldValue) && Array.isArray(currentSessionRef.current[typedKey])) {
              if (!areArraysEqual(fieldValue as unknown[], currentSessionRef.current[typedKey] as unknown[])) {
                changed = true;
                (updatedFields as any)[typedKey] = fieldValue;
              }
            } else {
              changed = true;
              (updatedFields as any)[typedKey] = fieldValue;
            }
          }
        }

        if (changed) {
          const updatedSession = { ...currentSessionRef.current, ...updatedFields };
          setSessionModified(true);
          setCurrentSession(updatedSession);
          
          // Trigger debounced auto-save
          debouncedSaveCurrentSession();
        }
      }
    },
    [
      setCurrentSession, // Stable setter from SessionStateContext
      setSessionModified, // Stable setter from SessionStateContext
      debouncedSaveCurrentSession, // Memoized function dependency
    ]
  );

  // Create a new session
  const createNewSession = useCallback(
    async (
      name: string,
      initialState: Partial<Session>
    ): Promise<string | null> => {
      if (!projectDirectory) {
        return null;
      }

      try {
        if (currentSessionRef.current && isSessionModifiedRef.current) {
          await saveCurrentSession();
        }

        // Check if current session is a draft and use its state as base
        let baseStateForNewSession = initialState;
        if (currentSessionRef.current?.id === DRAFT_SESSION_ID) {
          baseStateForNewSession = { 
            ...currentSessionRef.current, 
            projectDirectory 
          };
          // Remove the draft ID to let createSessionAction generate a new one
          delete (baseStateForNewSession as any).id;
        }

        const sessionData: Partial<Session> = {
          ...baseStateForNewSession,
          name,
          projectDirectory,
        };

        const result = await createSessionAction(sessionData);

        if (!result.isSuccess || !result.data) {
          throw new DatabaseError(
            result.message || "Failed to create new session",
            {
              severity: DatabaseErrorSeverity.WARNING,
              category: DatabaseErrorCategory.OTHER,
              context: { name, projectDirectory },
              reportToUser: true,
            }
          );
        }

        // Signal that we should load this session rather than loading it directly
        if (onSessionNeedsReload) {
          onSessionNeedsReload(result.data);
        }

        return result.data;
      } catch (error) {
        const dbError =
          error instanceof DatabaseError
            ? error
            : new DatabaseError(
                `Error creating session: ${error instanceof Error ? error.message : String(error)}`,
                {
                  originalError: error as unknown as Error | undefined,
                  category: DatabaseErrorCategory.OTHER,
                  severity: DatabaseErrorSeverity.WARNING,
                  context: { name, projectDirectory },
                  reportToUser: true,
                }
              );

        setSessionError(dbError);
        return null;
      }
    },
    [
      projectDirectory,
      saveCurrentSession,
      setSessionError,
      onSessionNeedsReload,
    ]
  );

  // Set the active session ID
  const setActiveSessionId = useCallback(
    async (sessionId: string | null) => {
      if (!projectDirectory) {
        return;
      }

      try {
        if (
          currentSessionRef.current &&
          isSessionModifiedRef.current &&
          sessionId !== currentSessionRef.current.id
        ) {
          await saveCurrentSession();
        }

        if (sessionId === null) {
          setCurrentSession(null);
          setSessionModified(false);
        } else if (sessionId !== currentSessionRef.current?.id && onSessionNeedsReload) {
          // Signal that we need to load this session instead of loading it directly
          onSessionNeedsReload(sessionId);
        }

        await setActiveSessionIdGlobally(sessionId);
      } catch (error) {
        const dbError =
          error instanceof DatabaseError
            ? error
            : new DatabaseError(
                `Error setting active session ID: ${error instanceof Error ? error.message : String(error)}`,
                {
                  originalError: error as unknown as Error | undefined,
                  category: DatabaseErrorCategory.OTHER,
                  severity: DatabaseErrorSeverity.WARNING,
                  context: { sessionId, projectDirectory },
                }
              );

        setSessionError(dbError);
      }
    },
    [
      projectDirectory,
      saveCurrentSession,
      setCurrentSession,
      setSessionModified,
      setActiveSessionIdGlobally,
      setSessionError,
      onSessionNeedsReload,
    ]
  );

  // Delete the active session
  const deleteActiveSession = useCallback(async () => {
    if (!currentSessionRef.current?.id) {
      return;
    }

    try {
      const sessionIdToDelete = currentSessionRef.current.id;
      const result = await deleteSessionAction(sessionIdToDelete);

      if (!result.isSuccess) {
        throw new DatabaseError(
          result.message || "Failed to delete active session",
          {
            severity: DatabaseErrorSeverity.WARNING,
            category: DatabaseErrorCategory.OTHER,
            context: { sessionId: sessionIdToDelete },
            reportToUser: true,
          }
        );
      }

      setCurrentSession(null);
      setSessionModified(false);

      await setActiveSessionIdGlobally(null);
    } catch (error) {
      const dbError =
        error instanceof DatabaseError
          ? error
          : new DatabaseError(
              `Error deleting session: ${error instanceof Error ? error.message : String(error)}`,
              {
                originalError: error as unknown as Error | undefined,
                category: DatabaseErrorCategory.OTHER,
                severity: DatabaseErrorSeverity.WARNING,
                context: { sessionId: currentSessionRef.current.id },
                reportToUser: true,
              }
            );

      setSessionError(dbError);
      throw dbError;
    }
  }, [
    setCurrentSession,
    setSessionModified,
    setActiveSessionIdGlobally,
    setSessionError,
  ]);

  // Delete a non-active session
  const deleteNonActiveSession = useCallback(
    async (sessionIdToDelete: string) => {
      if (!sessionIdToDelete) {
        setSessionError(new Error("Missing session ID for deletion"));
        return;
      }
      try {
        const result = await deleteSessionAction(sessionIdToDelete);

        if (!result.isSuccess) {
          throw new DatabaseError(
            result.message || "Failed to delete non-active session",
            {
              severity: DatabaseErrorSeverity.WARNING,
              category: DatabaseErrorCategory.OTHER,
              context: { sessionId: sessionIdToDelete },
              reportToUser: true,
            }
          );
        }
      } catch (error) {
        const dbError =
          error instanceof DatabaseError
            ? error
            : new DatabaseError(
                `Error deleting non-active session: ${error instanceof Error ? error.message : String(error)}`,
                {
                  originalError: error as unknown as Error | undefined,
                  category: DatabaseErrorCategory.OTHER,
                  severity: DatabaseErrorSeverity.WARNING,
                  context: { sessionId: sessionIdToDelete },
                  reportToUser: true,
                }
              );

        setSessionError(dbError);
        throw dbError;
      }
    },
    [setSessionError]
  );

  // Rename the active session
  const renameActiveSession = useCallback(
    async (newName: string) => {
      if (!currentSessionRef.current?.id) {
        return;
      }

      try {
        updateCurrentSessionFields({ name: newName });
        const result = await renameSessionAction(currentSessionRef.current.id, newName);

        if (!result.isSuccess) {
          throw new Error(result.message || "Failed to rename session");
        }

        await saveCurrentSession();
      } catch (error) {
        const dbError =
          error instanceof DatabaseError
            ? error
            : new DatabaseError(
                `Error renaming session: ${error instanceof Error ? error.message : String(error)}`,
                {
                  originalError: error as unknown as Error | undefined,
                  category: DatabaseErrorCategory.OTHER,
                  severity: DatabaseErrorSeverity.WARNING,
                  context: { sessionId: currentSessionRef.current.id, newName },
                  reportToUser: true,
                }
              );

        setSessionError(dbError);
      }
    },
    [
      updateCurrentSessionFields,
      saveCurrentSession,
      setSessionError,
    ]
  );

  // Rename any session by ID
  const renameSession = useCallback(
    async (sessionId: string, newName: string) => {
      if (!sessionId || !newName.trim()) {
        setSessionError(new Error("Session ID and new name are required for rename."));
        return;
      }

      try {
        const result = await renameSessionAction(sessionId, newName);

        if (!result.isSuccess) {
          throw new Error(result.message || "Failed to rename session");
        }

        if (onSessionNeedsReload) {
          onSessionNeedsReload(sessionId);
        }
      } catch (error) {
        const dbError =
          error instanceof DatabaseError
            ? error
            : new DatabaseError(
                `Error renaming session: ${error instanceof Error ? error.message : String(error)}`,
                {
                  originalError: error as unknown as Error | undefined,
                  category: DatabaseErrorCategory.OTHER,
                  severity: DatabaseErrorSeverity.WARNING,
                  context: { sessionId, newName },
                  reportToUser: true,
                }
              );

        setSessionError(dbError);
        throw dbError;
      }
    },
    [setSessionError, onSessionNeedsReload]
  );

  return useMemo(
    () => ({
      saveCurrentSession,
      flushSaves,
      updateCurrentSessionFields,
      createNewSession,
      setActiveSessionId,
      deleteActiveSession,
      deleteNonActiveSession,
      renameActiveSession,
      renameSession,
    }),
    [
      saveCurrentSession,
      flushSaves,
      updateCurrentSessionFields,
      createNewSession,
      setActiveSessionId,
      deleteActiveSession,
      deleteNonActiveSession,
      renameActiveSession,
      renameSession,
    ]
  );
}

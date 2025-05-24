"use client";

import { useCallback, type MutableRefObject } from "react";

import { getSessionAction } from "@/actions";
import { useProject } from "@/contexts/project-context";
import { useUILayout } from "@/contexts/ui-layout-context";
import { type Session } from "@/types";
import {
  DatabaseError,
  DatabaseErrorCategory,
  DatabaseErrorSeverity,
} from "@/types/error-types";

/**
 * Hook for loading sessions, focused solely on the loading operation
 */
export function useSessionLoader({
  currentSession,
  setCurrentSession,
  setSessionLoading,
  setSessionModified,
  setSessionError,
  hasCompletedInitRef,
  loadingSessionRef,
  onNeedsSave,
  setActiveSessionIdGlobally,
}: {
  currentSession: Session | null;
  setCurrentSession: (session: Session | null) => void;
  setSessionLoading: (loading: boolean) => void;
  setSessionModified: (modified: boolean) => void;
  setSessionError: (error: Error | null) => void;
  hasCompletedInitRef: MutableRefObject<boolean>;
  loadingSessionRef: MutableRefObject<{
    id: string | null;
    timestamp: number;
  }>;
  onNeedsSave?: (currentSessionId: string) => Promise<boolean>;
  setActiveSessionIdGlobally: (sessionId: string | null) => Promise<void>;
}) {
  const { projectDirectory } = useProject();
  const { setAppInitializing } = useUILayout();

  // Load a session by ID
  const loadSessionById = useCallback(
    async (sessionId: string) => {
      // Helper function to complete initialization
      const completeInitialization = () => {
        if (!hasCompletedInitRef.current) {
          hasCompletedInitRef.current = true;
          setAppInitializing(false);
        }
      };

      if (!sessionId) {
        completeInitialization();
        return;
      }

      if (!projectDirectory) {
        completeInitialization();
        return;
      }

      if (currentSession?.id === sessionId) {
        completeInitialization();
        return;
      }

      const now = Date.now();
      const loadingData = loadingSessionRef.current;

      if (loadingData.id === sessionId && now - loadingData.timestamp < 3000) {
        return;
      }

      loadingSessionRef.current = { id: sessionId, timestamp: now };
      setSessionLoading(true);

      const previousSessionId = currentSession?.id;
      let loadSuccess = false;

      // Create a safety timeout - reduced to 2 seconds
      const safetyTimeout = setTimeout(() => {
        setSessionLoading(false);
        loadingSessionRef.current = { id: null, timestamp: 0 };

        if (typeof window !== "undefined" && !loadSuccess) {
          window.dispatchEvent(
            new CustomEvent("session-load-failed", {
              detail: {
                sessionId,
                previousSessionId,
                error: "Session load timed out",
              },
            })
          );
        }

        completeInitialization();
      }, 2000); // 2 seconds timeout

      try {
        // If there's a current session with a different ID that needs saving,
        // use the callback to request a save operation
        if (
          currentSession?.id &&
          currentSession.id !== sessionId &&
          onNeedsSave
        ) {
          await onNeedsSave(currentSession.id);
        }

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("session-load-start", {
              detail: {
                sessionId,
                previousSessionId,
              },
            })
          );
        }

        const result = await getSessionAction(sessionId);

        if (!result || !result.isSuccess || !result.data) {
          throw new DatabaseError(`Session not found: ${sessionId}`, {
            severity: DatabaseErrorSeverity.WARNING,
            category: DatabaseErrorCategory.QUERY,
            context: { sessionId },
            reportToUser: true,
          });
        }

        const session = result.data;

        if (!session.taskDescription && session.taskDescription !== "") {
          session.taskDescription = session.taskDescription || "";
        }

        setCurrentSession(session);
        setSessionModified(false);
        
        // Set this as the active session
        await setActiveSessionIdGlobally(sessionId);
        
        loadSuccess = true;

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("session-load-complete", {
              detail: {
                sessionId,
                previousSessionId,
                success: true,
              },
            })
          );
        }

        completeInitialization();
      } catch (error) {
        const dbError =
          error instanceof DatabaseError
            ? error
            : new DatabaseError(
                `Error loading session: ${error instanceof Error ? error.message : String(error)}`,
                {
                  originalError: error as Error,
                  category: DatabaseErrorCategory.QUERY,
                  severity: DatabaseErrorSeverity.WARNING,
                  context: { sessionId },
                  reportToUser: true,
                }
              );

        setSessionError(dbError);

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("session-load-failed", {
              detail: {
                sessionId,
                previousSessionId,
                error: dbError.message,
              },
            })
          );
        }

        completeInitialization();

        throw dbError;
      } finally {
        clearTimeout(safetyTimeout);
        setSessionLoading(false);

        if (loadingSessionRef.current.id === sessionId) {
          loadingSessionRef.current = { id: null, timestamp: 0 };
        }
      }
    },
    [
      currentSession,
      projectDirectory,
      setAppInitializing,
      setCurrentSession,
      setSessionLoading,
      setSessionModified,
      setSessionError,
      hasCompletedInitRef,
      loadingSessionRef,
      onNeedsSave,
      setActiveSessionIdGlobally,
    ]
  );

  return {
    loadSessionById,
  };
}

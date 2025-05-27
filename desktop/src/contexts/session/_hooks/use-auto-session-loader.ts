"use client";

import { useEffect, type MutableRefObject } from "react";

import { type Session } from "@/types";
import { DRAFT_SESSION_ID } from "./use-session-state";

interface UseAutoSessionLoaderProps {
  projectDirectory: string | undefined;
  activeSessionId: string | null;
  currentSession: Session | null;
  isSessionLoading: boolean;
  loadSessionById: (sessionId: string) => Promise<void>;
  setAppInitializing: (initializing: boolean) => void;
  setSessionLoading: (loading: boolean) => void;
  hasCompletedInitRef: MutableRefObject<boolean>;
}

export function useAutoSessionLoader({
  projectDirectory,
  activeSessionId,
  currentSession,
  isSessionLoading,
  loadSessionById,
  setAppInitializing,
  setSessionLoading,
  hasCompletedInitRef,
}: UseAutoSessionLoaderProps) {
  useEffect(() => {
    const completeInit = () => {
      if (!hasCompletedInitRef.current) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
    };

    if (!projectDirectory) {
      // No project, ensure init is marked complete if it wasn't
      completeInit();
      return;
    }

    if (!activeSessionId) {
      // No active session to load, ensure init is marked complete
      // This also handles the case where active session becomes null (e.g., last session deleted)
      if (currentSession?.id !== DRAFT_SESSION_ID) {
        // If not already on a draft, setCurrentSession(null) or a new draft might be needed
        // This part is handled by SessionProvider's draft session logic.
      }
      completeInit();
      return;
    }

    // If already loading this session, or it's already the current one, do nothing.
    if (isSessionLoading || currentSession?.id === activeSessionId) {
      completeInit(); // Ensure init completes if conditions met
      return;
    }

    // At this point, we have a project, an activeSessionId, not currently loading,
    // and the activeSessionId is different from the currentSession.id.
    // This means we should load the session.

    setSessionLoading(true);
    loadSessionById(activeSessionId)
      .catch((error) => {
        // Error is handled by loadSessionById (sets sessionError)
        console.error(`[AutoSessionLoader] Error loading session ${activeSessionId}:`, error);
      })
      .finally(() => {
        // setSessionLoading(false) is handled by loadSessionById
        completeInit();
      });

    // Dependencies:
    // - projectDirectory: If it changes, we might need to re-evaluate.
    // - activeSessionId: The primary trigger for loading a session.
    // - currentSession?.id: To check if the target session is already loaded.
    // - isSessionLoading: To prevent concurrent loads.
    // - loadSessionById, setAppInitializing, setSessionLoading, hasCompletedInitRef: Stable functions/refs.
  }, [
    projectDirectory,
    activeSessionId,
    currentSession?.id, // Only depend on the ID part of currentSession
    isSessionLoading,
    loadSessionById,
    setAppInitializing,
    setSessionLoading,
  ]);
}

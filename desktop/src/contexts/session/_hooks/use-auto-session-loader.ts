"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

import { type Session } from "@/types";

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
  const initialAutoLoadCompleteRef = useRef<boolean>(false);
  const prevActiveSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Helper function to complete initialization
    const completeInitialization = () => {
      if (!hasCompletedInitRef.current) {
        hasCompletedInitRef.current = true;
        setAppInitializing(false);
      }
      if (!initialAutoLoadCompleteRef.current) {
        initialAutoLoadCompleteRef.current = true;
      }
    };

    // Skip if there's no projectDirectory or activeSessionId
    if (!projectDirectory || !activeSessionId) {
      completeInitialization();
      return;
    }

    // Skip conditions
    if (
      isSessionLoading ||
      currentSession?.id === activeSessionId ||
      activeSessionId === prevActiveSessionIdRef.current
    ) {
      // Handle case where session is already loaded
      if (
        currentSession?.id === activeSessionId &&
        !initialAutoLoadCompleteRef.current
      ) {
        completeInitialization();
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
        completeInitialization();
      });

      return;
    }

    // Normal subsequent loads
    prevActiveSessionIdRef.current = activeSessionId;
    loadSessionById(activeSessionId).catch(() => {});
  }, [
    activeSessionId,
    currentSession,
    loadSessionById,
    projectDirectory,
    isSessionLoading,
    setAppInitializing,
    hasCompletedInitRef,
    setSessionLoading,
  ]);
}

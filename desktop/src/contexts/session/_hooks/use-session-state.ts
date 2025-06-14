"use client";

import { useState, useMemo } from "react";

import { type Session } from "@/types";


/**
 * Hook to manage session state, loading, and modification status
 * Extracts state management from SessionProvider
 *
 * This hook now returns both state values (to be exposed via SessionStateContext)
 * and state setters (to be used internally and exposed via SessionActionsContext)
 */
export function useSessionState() {
  // Session and loading state
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isSessionLoading, setSessionLoading] = useState<boolean>(false);
  const [isSessionModified, setSessionModified] = useState<boolean>(false);

  // Track errors that occur during session operations
  const [sessionError, setSessionError] = useState<Error | null>(null);

  return useMemo(
    () => ({
      // States - these will be part of SessionStateContext
      currentSession,
      isSessionLoading,
      isSessionModified,
      sessionError,

      // State setters - these will be used internally and in SessionActionsContext
      setCurrentSession,
      setSessionLoading,
      setSessionModified,
      setSessionError,
    }),
    [
      currentSession,
      isSessionLoading,
      isSessionModified,
      sessionError,
      setCurrentSession,
      setSessionLoading,
      setSessionModified,
      setSessionError,
    ]
  );
}

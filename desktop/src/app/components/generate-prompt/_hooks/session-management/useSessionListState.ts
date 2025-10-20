"use client";

import { useState, useRef, useEffect } from "react";

import { type Session } from "@/types/session-types";
import { registerSessionEventHandlers } from "@/contexts/session/event-bridge";
import { useSessionStateContext } from "@/contexts/session/index";

import { sessionsAreEqual } from "./session-list-utils";

/**
 * Hook to manage the list of sessions, including loading state and errors
 */
export function useSessionListState() {
  const { sessionListVersion } = useSessionStateContext();

  // Session list state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Refs for tracking state and preventing race conditions
  const pendingLoadRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const lastFetchTimeRef = useRef<number>(0);
  const operationsRef = useRef<Set<string>>(new Set());
  const deletedSessionIdsRef = useRef<Set<string>>(new Set());

  /**
   * Set sessions with equality check to prevent unnecessary re-renders
   */
  const updateSessions = (
    newSessions: Session[],
    forceUpdate: boolean = false
  ) => {
    setSessions((prevSessions) => {
      // Skip update if sessions haven't changed and force update is not requested
      if (!forceUpdate && sessionsAreEqual(newSessions, prevSessions)) {
        return prevSessions;
      }
      return newSessions;
    });
  };

  // Subscribe to session events for real-time list updates
  useEffect(() => {
    const unregister = registerSessionEventHandlers({
      onSessionUpdated: (session) => {
        setSessions((prev: Session[]) => {
          const index = prev.findIndex(s => s.id === session.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = { ...prev[index], ...session };
            return next.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          }
          return prev;
        });
      },
      onSessionDeleted: (sessionId) => {
        setSessions((prev: Session[]) => prev.filter(s => s.id !== sessionId));
      },
      onSessionListInvalidate: () => {
        // Optional: trigger refresh if session not found locally
        // For now, just rely on the above handlers
      },
    });

    return unregister;
  }, []);

  return {
    // State
    sessions,
    setSessions: updateSessions,
    isLoadingSessions,
    setIsLoadingSessions,
    sessionsError,
    setSessionsError,
    searchQuery,
    setSearchQuery,
    sessionListVersion,

    // Refs
    pendingLoadRef,
    hasLoadedOnceRef,
    lastFetchTimeRef,
    operationsRef,
    deletedSessionIdsRef,
  };
}

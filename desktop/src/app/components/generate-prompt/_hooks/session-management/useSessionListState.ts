"use client";

import { useState, useRef } from "react";

import { type Session } from "@/types/session-types";

import { sessionsAreEqual } from "./session-list-utils";

/**
 * Hook to manage the list of sessions, including loading state and errors
 */
export function useSessionListState() {
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

    // Refs
    pendingLoadRef,
    hasLoadedOnceRef,
    lastFetchTimeRef,
    operationsRef,
    deletedSessionIdsRef,
  };
}

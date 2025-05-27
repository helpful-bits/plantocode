"use client";

import { useCallback, useRef, useEffect } from "react";

import { getSessionsAction } from "@/actions";
import { useNotification } from "@/contexts/notification-context";
import { type Session } from "@/types/session-types";

interface UseSessionQueriesProps {
  projectDirectory: string | null;
  sessions: Session[];
  setSessions: (sessions: Session[], forceUpdate?: boolean) => void;
  setIsLoadingSessions: (isLoading: boolean) => void;
  setSessionsError: (error: string | null) => void;
  pendingLoadRef: React.MutableRefObject<boolean>;
  hasLoadedOnceRef: React.MutableRefObject<boolean>;
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>;
}

export function useSessionQueries({
  projectDirectory,
  setSessions,
  setIsLoadingSessions,
  setSessionsError,
  pendingLoadRef,
  hasLoadedOnceRef,
  deletedSessionIdsRef,
}: UseSessionQueriesProps) {
  const { showNotification } = useNotification();

  // Use refs to avoid stale closures
  const setSessionsRef = useRef(setSessions);
  const setIsLoadingSessionsRef = useRef(setIsLoadingSessions);
  const setSessionsErrorRef = useRef(setSessionsError);
  const showNotificationRef = useRef(showNotification);

  // Keep refs up to date
  useEffect(() => {
    setSessionsRef.current = setSessions;
    setIsLoadingSessionsRef.current = setIsLoadingSessions;
    setSessionsErrorRef.current = setSessionsError;
    showNotificationRef.current = showNotification;
  });

  const loadSessions = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!projectDirectory) {
        setSessionsErrorRef.current("No project directory selected");
        return;
      }

      if (pendingLoadRef.current && !forceRefresh) {
        return;
      }

      pendingLoadRef.current = true;
      setSessionsErrorRef.current(null);

      if (!hasLoadedOnceRef.current || forceRefresh) {
        setIsLoadingSessionsRef.current(true);
      }

      try {
        const sessionsResult = await getSessionsAction(projectDirectory);

        if (!sessionsResult.isSuccess) {
          throw new Error(sessionsResult.message || "Failed to load sessions");
        }

        const sessionsList = sessionsResult.data || [];
        hasLoadedOnceRef.current = true;

        const filteredList = sessionsList.filter((session: { id?: string | number }) => {
          if (!session || !session.id) return false;
          return !deletedSessionIdsRef.current.has(String(session.id));
        });

        setSessionsRef.current(filteredList as Session[], forceRefresh);
      } catch (_err) {
        setSessionsErrorRef.current("Failed to load sessions");
        setSessionsRef.current([], true);

        showNotificationRef.current({
          title: "Error",
          message: "Failed to load sessions",
          type: "error",
        });

        hasLoadedOnceRef.current = true;
      } finally {
        setIsLoadingSessionsRef.current(false);
        pendingLoadRef.current = false;
      }
    },
    [projectDirectory]
  );

  return {
    loadSessions,
  };
}
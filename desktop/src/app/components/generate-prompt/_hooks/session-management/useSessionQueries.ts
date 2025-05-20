"use client";

import { useCallback } from "react";

import { getSessionsAction } from "@/actions";
import { useNotification } from "@/contexts/notification-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";
import { type Session } from "@/types/session-types";
import { normalizePath } from "@/utils/path-utils";

// Minimum time between session fetch operations
const MIN_FETCH_INTERVAL_MS = 5000; // 5 seconds

interface UseSessionQueriesProps {
  projectDirectory: string | null;
  onLoadSessionUISync: (session: Session) => void;
  onSessionNameChangeUISync: (name: string) => void;
  // Session list state from useSessionListState
  sessions: Session[];
  setSessions: (sessions: Session[], forceUpdate?: boolean) => void;
  setIsLoadingSessions: (isLoading: boolean) => void;
  setSessionsError: (error: string | null) => void;
  pendingLoadRef: React.MutableRefObject<boolean>;
  hasLoadedOnceRef: React.MutableRefObject<boolean>;
  lastFetchTimeRef: React.MutableRefObject<number>;
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>;
}

/**
 * Hook to fetch session data from the server
 */
export function useSessionQueries({
  projectDirectory,
  onLoadSessionUISync,
  onSessionNameChangeUISync,
  sessions,
  setSessions,
  setIsLoadingSessions,
  setSessionsError,
  pendingLoadRef,
  hasLoadedOnceRef,
  lastFetchTimeRef,
  deletedSessionIdsRef,
}: UseSessionQueriesProps) {
  const { activeSessionId, currentSession } = useSessionStateContext();

  const { loadSessionById } = useSessionActionsContext();

  const { showNotification } = useNotification();

  /**
   * Load sessions from the server
   */
  const loadSessions = useCallback(
    async (forceRefresh: boolean = false) => {
      // Check if project directory exists
      if (!projectDirectory) {
        // Skip loadSessions when no project directory is available
        setSessionsError("No project directory selected");
        return;
      }

      if (!forceRefresh) {
        // Check for pending operation
        if (pendingLoadRef.current) {
          // Skip loadSessions when a load is already pending
          return;
        }

        // Check if minimum time interval has passed since last fetch
        const now = Date.now();
        const timeSinceLastFetch = now - lastFetchTimeRef.current;
        if (
          lastFetchTimeRef.current > 0 &&
          timeSinceLastFetch < MIN_FETCH_INTERVAL_MS
        ) {
          // Throttle loadSessions to prevent excessive calls
          return;
        }
      }

      const normalizedProjectDir = await normalizePath(projectDirectory);
      // Loading sessions for project directory

      // Reset any previous errors
      setSessionsError(null);

      // Set pending flag and update last fetch time
      pendingLoadRef.current = true;
      lastFetchTimeRef.current = Date.now();

      // Throttle frequent calls by applying a small delay
      await new Promise((resolve) => setTimeout(resolve, 50));

      if (!hasLoadedOnceRef.current) {
        setIsLoadingSessions(true);
      }

      try {
        // Generate unique ID for tracking this load operation was done in previous version
        // No longer needed as we use other mechanisms for tracking operations
        // Call sessions action with normalized project path
        
        const sessionsList = await getSessionsAction(normalizedProjectDir);

        if (!Array.isArray(sessionsList)) {
          throw new Error(
            "Invalid response format: sessionsList is not an array"
          );
        }

        // Sessions loaded successfully

        // Mark as loaded
        hasLoadedOnceRef.current = true;

        // If we get an empty array but already have sessions displayed,
        // AND we're not currently forcing a refresh,
        // keep the existing sessions displayed but disabled
        if (sessionsList.length === 0 && sessions.length > 0 && !forceRefresh) {
          // Keep existing UI state to avoid flicker on empty server response
          setIsLoadingSessions(false); // Just clear loading state, keep UI stable
          return;
        }

        // Filter out any recently deleted sessions to prevent race conditions
        const filteredList = sessionsList.filter((session: { id?: string | number }) => {
          if (!session || !session.id) {
            // Skip invalid sessions missing ID
            return false;
          }
          return !deletedSessionIdsRef.current.has(String(session.id));
        });

        // Filter out recently deleted sessions to avoid UI inconsistencies

        // Process loaded sessions

        // Auto-activate a session if none is active but sessions exist
        if (!activeSessionId && filteredList.length > 0) {
          // Auto-activate most recent session when no session is active

          // Sort by updated time to get the most recently used session
          const sortedSessions = [...filteredList].sort(
            (a, b) => {
              const bUpdated = b.updatedAt ? Number(b.updatedAt) : 0;
              const aUpdated = a.updatedAt ? Number(a.updatedAt) : 0;
              return bUpdated - aUpdated;
            }
          );

          if (sortedSessions.length > 0) {
            const sessionToActivate = sortedSessions[0];
            // Auto-activate the most recently used session

            // Use a small timeout to avoid React state update conflicts
            setTimeout(() => {
              // Use loadSessionById with force option to ensure the session loads properly
              const loadPromise = loadSessionById(sessionToActivate.id ? String(sessionToActivate.id) : '');

              loadPromise
                .then(() => {
                  if (currentSession) {
                    // Session auto-activation successful
                    onLoadSessionUISync(currentSession);
                    onSessionNameChangeUISync(currentSession.name);
                  }
                })
                .catch((_error: unknown) => {
                  // Session auto-activation failed
                });
            }, 50);
          }
        }

        // Apply update - check if sessions have actually changed to avoid unnecessary rerenders
        setSessions(filteredList as Session[], forceRefresh);
      } catch (_err) {
        // Failed to load sessions
        setSessionsError("Failed to load sessions");
        setSessions([], true);

        showNotification({
          title: "Error",
          message: "Failed to load sessions",
          type: "error",
        });

        // Ensure loading is cleared on error
        hasLoadedOnceRef.current = true;
      } finally {
        setIsLoadingSessions(false);

        // Set a cooldown period before allowing the next load
        setTimeout(() => {
          pendingLoadRef.current = false;
        }, 500); // 0.5 second cooldown
      }
    },
    [
      projectDirectory,
      activeSessionId,
      currentSession,
      sessions.length,
      showNotification,
      loadSessionById,
      onLoadSessionUISync,
      onSessionNameChangeUISync,
      setSessions,
      setIsLoadingSessions,
      setSessionsError,
      pendingLoadRef,
      hasLoadedOnceRef,
      lastFetchTimeRef,
      deletedSessionIdsRef,
    ]
  );

  return {
    loadSessions,
    isLoadingSessions: hasLoadedOnceRef.current,
  };
}
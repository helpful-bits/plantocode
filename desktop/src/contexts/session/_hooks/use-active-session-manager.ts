"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

import { getActiveSessionIdAction, setActiveSessionAction } from "@/actions";

interface UseActiveSessionManagerProps {
  projectDirectory?: string;
}

/**
 * Hook for managing the active session ID
 * - Handles loading active session ID when project directory changes
 * - Provides function to update active session ID (both locally and in DB)
 *
 * This hook is now structured to clearly separate state and actions
 * to align with our SessionStateContext and SessionActionsContext approach
 */
export function useActiveSessionManager({
  projectDirectory,
}: UseActiveSessionManagerProps) {
  // Manage active session ID state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hasResolvedActiveSessionId, setHasResolvedActiveSessionId] = useState(false);

  // Track pending operations
  const pendingOperationRef = useRef<{
    sessionId: string | null;
    timestamp: number;
  } | undefined>(undefined);

  // Track last persisted ID for additional deduplication
  const lastPersistedIdRef = useRef<string | null>(null);

  // Load the active session ID when the project directory changes
  useEffect(() => {
    let isMounted = true;

    setHasResolvedActiveSessionId(false);
    pendingOperationRef.current = undefined;
    lastPersistedIdRef.current = null;
    setActiveSessionId(null);

    if (!projectDirectory) {
      if (isMounted) {
        setHasResolvedActiveSessionId(true);
      }
      return () => {
        isMounted = false;
      };
    }

    const fetchActiveSessionId = async () => {
      try {
        const result = await getActiveSessionIdAction(projectDirectory);

        if (isMounted && result.isSuccess) {
          setActiveSessionId(result.data ?? null);
        }
      } catch (_err) {
        // Failed to get active session
      } finally {
        if (isMounted) {
          setHasResolvedActiveSessionId(true);
        }
      }
    };

    void fetchActiveSessionId();
    return () => {
      isMounted = false;
    };
  }, [projectDirectory]);

  // Set active session ID globally
  const updateActiveSessionId = useCallback(
    async (sessionId: string | null) => {
      if (!projectDirectory) {
        return;
      }

      // Skip if the current sessionId is already set to the requested value
      if (activeSessionId === sessionId) {
        return;
      }

      // Skip if we just persisted this exact ID (additional deduplication)
      if (sessionId === lastPersistedIdRef.current) {
        return;
      }

      // Check if an operation is already in progress for this sessionId
      const now = Date.now();
      const pendingOp = pendingOperationRef.current;

      if (
        pendingOp &&
        pendingOp.sessionId === sessionId &&
        now - pendingOp.timestamp < 2000
      ) {
        return;
      }

      // Set the pending operation
      pendingOperationRef.current = { sessionId, timestamp: now };

      try {
        // First, update local state immediately for responsive UI
        setActiveSessionId(sessionId);

        // Then persist to the database
        const result = await setActiveSessionAction(
          projectDirectory,
          sessionId
        );

        // Check if action failed
        if (result && !result.isSuccess) {
          console.error("Failed to persist active session:", result.message);
        } else {
          // Update last persisted ID for deduplication only on success
          lastPersistedIdRef.current = sessionId;
        }

        // Clear the pending operation reference on success
        if (pendingOperationRef.current?.sessionId === sessionId) {
          pendingOperationRef.current = undefined;
        }
      } catch (_err) {
        // Error setting active session

        // Clear the pending operation reference on error
        if (pendingOperationRef.current?.sessionId === sessionId) {
          pendingOperationRef.current = undefined;
        }
      }
    },
    [projectDirectory, activeSessionId]
  );

  // Return an object that clearly separates state from actions
  return useMemo(
    () => ({
      // State (for SessionStateContext)
      activeSessionId,
      hasResolvedActiveSessionId,

      // Actions (for SessionActionsContext)
      updateActiveSessionId,
    }),
    [activeSessionId, hasResolvedActiveSessionId, updateActiveSessionId]
  );
}

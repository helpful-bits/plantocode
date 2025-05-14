"use client";

/**
 * Hook for managing the active session ID per project
 * Provides an abstraction for storing/retrieving active session IDs
 * using database persistence via Next.js Server Actions
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { setActiveSessionAction, getActiveSessionIdAction } from '@core/actions/session-actions';

/**
 * Hook to manage the active session ID for a specific project directory
 * @param projectDirectory The absolute path to the project directory
 * @returns The active session ID and a function to set it
 */
export function useActiveSession(projectDirectory: string) {
  // Core state for active session ID
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Track error state
  const [error, setError] = useState<Error | null>(null);

  // Keep track of the last loaded directory to prevent redundant loads
  const lastLoadedDirectoryRef = useRef<string>('');
  const initialLoadCompleteRef = useRef<boolean>(false);

  // Load the active session ID from the database when the component mounts
  // or when the projectDirectory changes
  useEffect(() => {
    // Skip if no projectDirectory is provided
    if (!projectDirectory) {
      return;
    }

    // Skip if this directory was already loaded and we're just reconstructing the component
    if (projectDirectory === lastLoadedDirectoryRef.current && initialLoadCompleteRef.current) {
      console.log(`[useActiveSession] Skipping redundant load for already loaded directory: ${projectDirectory}`);
      return;
    }

    // Update the reference for future checks
    lastLoadedDirectoryRef.current = projectDirectory;

    // Define an async function to fetch the active session ID
    const fetchActiveSessionId = async () => {

      try {
        console.log(`[useActiveSession] Fetching active session ID for directory: ${projectDirectory}`);

        // Get the active session ID from the database
        const result = await getActiveSessionIdAction(projectDirectory);

        if (result.isSuccess && result.data !== undefined) {
          console.log(`[useActiveSession] Successfully loaded session ID: ${result.data}`);
          setActiveSessionId(result.data);
        } else {
          console.error(`[useActiveSession] Failed to get active session ID: ${result.message}`);
          setError(new Error(result.message || 'Failed to get active session ID'));
        }

        // Mark initial load as complete
        initialLoadCompleteRef.current = true;
      } catch (err) {
        console.error(`[useActiveSession] Error getting active session ID:`, err);
        setError(err instanceof Error ? err : new Error('Failed to get active session ID'));
      }
    };

    // Call the function
    fetchActiveSessionId();
  }, [projectDirectory]);

  // Track operations in progress to prevent duplicate calls
  const pendingOperationRef = useRef<{sessionId: string | null, timestamp: number} | null>(null);

  // Set active session ID globally by persisting to the database
  const setActiveSessionIdGlobally = useCallback(
    async (sessionId: string | null) => {
      if (!projectDirectory) {
        console.error('[useActiveSession] Cannot set active session: missing project directory');
        setError(new Error('Missing project directory'));
        return;
      }

      // Skip if the current sessionId is already set to the requested value
      if (activeSessionId === sessionId) {
        console.log(`[useActiveSession] Skipping setActiveSessionIdGlobally - already set to: ${sessionId}`);
        return;
      }

      // Check if an operation is already in progress for this sessionId
      const now = Date.now();
      const pendingOp = pendingOperationRef.current;

      if (pendingOp && pendingOp.sessionId === sessionId && (now - pendingOp.timestamp) < 2000) {
        console.log(`[useActiveSession] Operation for sessionId ${sessionId} already in progress, skipping duplicate`);
        return;
      }

      // Set the pending operation
      pendingOperationRef.current = { sessionId, timestamp: now };
      console.log(`[useActiveSession] Setting active session ID globally: ${sessionId}`);

      try {
        // First, update local state immediately for responsive UI
        setActiveSessionId(sessionId);

        // Then persist to the database
        await setActiveSessionAction(projectDirectory, sessionId);

        // Clear the pending operation reference on success
        if (pendingOperationRef.current?.sessionId === sessionId) {
          pendingOperationRef.current = null;
        }
      } catch (err) {
        console.error(`[useActiveSession] Error setting active session:`, err);
        setError(err instanceof Error ? err : new Error('Failed to set active session'));

        // Clear the pending operation reference on error
        if (pendingOperationRef.current?.sessionId === sessionId) {
          pendingOperationRef.current = null;
        }
      }
    },
    [projectDirectory, activeSessionId]  // Add activeSessionId as dependency
  );

  return {
    activeSessionId,
    setActiveSessionIdGlobally,
    error
  };
}
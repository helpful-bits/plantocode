"use client";

import { useState, useRef, useCallback, useEffect } from "react";

import { useProjectPersistenceService } from "@/hooks/useProjectPersistenceService";
import { trackAPICall } from "@/utils/api-call-tracker";
import { normalizePath } from "@/utils/path-utils";

import { useNotification } from "../notification-context";

export interface ProjectDirectoryState {
  projectDirectory: string;
  isLoading: boolean;
  error: string | null;
}

export interface ProjectDirectoryManager extends ProjectDirectoryState {
  setProjectDirectory: (dir: string) => Promise<void>;
  isInitialLoadingRef: React.RefObject<boolean>;
}

/**
 * Hook to manage project directory state, persistence, and related effects
 */
export function useProjectDirectoryManager(): ProjectDirectoryManager {
  const { showNotification } = useNotification();
  const { loadProjectDirectory, saveProjectDirectory } =
    useProjectPersistenceService();

  // Local state
  const [state, setState] = useState<ProjectDirectoryState>({
    projectDirectory: "",
    isLoading: true,
    error: null,
  });

  // Refs
  const lastProjectDirChangeRef = useRef<number>(0);
  const PROJECT_DIR_CHANGE_COOLDOWN = 5000; // 5 second cooldown
  const hasInitializedRef = useRef<boolean>(false);

  // Track initialization state to prevent circular dependencies
  const isInitialLoadingRef = useRef<boolean>(true);

  // Load initial project directory
  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      // Set loading state
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Load project directory via the persistence service
        const normalizedDir = await loadProjectDirectory();

        // Safety check for component unmount during async operation
        if (!isMounted) return;

        // Track API call for debugging purposes
        trackAPICall("loadProjectDirectory", normalizedDir, null, {
          isInitialLoad: isInitialLoadingRef.current,
        });

        if (normalizedDir) {

          // Set project directory, but ensure it doesn't trigger context cascades
          if (isInitialLoadingRef.current) {
            setState((prev) => ({ ...prev, projectDirectory: normalizedDir }));
            isInitialLoadingRef.current = false;
          } else {
            // Only update if it's actually different
            if (state.projectDirectory !== normalizedDir) {
              setState((prev) => ({
                ...prev,
                projectDirectory: normalizedDir,
              }));
            } else {
              // Skip redundant update
            
            }
          }

          // Mark project as initialized
          hasInitializedRef.current = true;
        } else {
          // No cached directory found
          // Mark initialization as completed even if no directory found
          isInitialLoadingRef.current = false;
          hasInitializedRef.current = true;
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = `Failed to load project data: ${err instanceof Error ? err.message : String(err)}`;
          setState((prev) => ({ ...prev, error: errorMessage }));

          // Show notification for the error
          showNotification({
            title: "Error",
            message: errorMessage,
            type: "error",
          });
        }
      } finally {
        if (isMounted) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    void loadInitialData();

    // Cleanup function to prevent state updates if unmounted
    return () => {
      isMounted = false;
    };
  }, [showNotification, loadProjectDirectory, state.projectDirectory]);

  // Set project directory with persistence
  const setProjectDirectory = useCallback(
    async (dir: string) => {
      if (!dir) return;

      const now = Date.now();
      const lastChange = lastProjectDirChangeRef.current;

      // Prevent rapid changes (debounce)
      if (now - lastChange < PROJECT_DIR_CHANGE_COOLDOWN) {
        return;
      }

      lastProjectDirChangeRef.current = now;

      try {
        // Normalize the path
        const normalizedDir = await normalizePath(dir);

        // Track API call for debugging purposes
        trackAPICall("setProjectDirectory", normalizedDir, null, {
          previous: state.projectDirectory || "none",
          timestamp: Date.now(),
        });

        // Update state for immediate UI response
        setState((prev) => ({ ...prev, projectDirectory: normalizedDir }));

        // Save the directory to persistent storage
        const saveResult = await saveProjectDirectory(normalizedDir);

        if (!saveResult.success) {
          // Don't revert the state as the directory may be valid even if persistence failed
        }
      } catch (err) {
        const errorMessage = `Failed to set project directory: ${err instanceof Error ? err.message : String(err)}`;
        setState((prev) => ({ ...prev, error: errorMessage }));

        showNotification({
          title: "Error",
          message: errorMessage,
          type: "error",
        });
      }
    },
    [showNotification, state.projectDirectory, saveProjectDirectory]
  );

  return {
    ...state,
    setProjectDirectory,
    isInitialLoadingRef,
  };
}

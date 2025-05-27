"use client";

import { useState, useRef, useCallback, useEffect } from "react";

import { useProjectPersistenceService } from "@/hooks/useProjectPersistenceService";
import { AppError, getErrorMessage } from "@/utils/error-handling";
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
      // Only run if it's truly the initial load for this hook instance
      if (!isInitialLoadingRef.current) return;

      // Set loading state
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Load project directory via the persistence service
        const normalizedDir = await loadProjectDirectory();

        // Safety check for component unmount during async operation
        if (!isMounted) return;

        if (normalizedDir) {
          // Update state only if it's different or first time
          setState((prev) => {
            if (prev.projectDirectory !== normalizedDir) {
              return { ...prev, projectDirectory: normalizedDir };
            }
            return prev;
          });
        }
        hasInitializedRef.current = true;
      } catch (err) {
        if (isMounted) {
          // Handle AppError instances with their specific properties
          let errorMessage: string;
          if (err instanceof AppError) {
            errorMessage = `Failed to load project data: ${err.message}`;
          } else {
            errorMessage = `Failed to load project data: ${getErrorMessage(err)}`;
          }

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
          isInitialLoadingRef.current = false; // Mark initial load as done
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    void loadInitialData();

    // Cleanup function to prevent state updates if unmounted
    return () => {
      isMounted = false;
    };
  }, [loadProjectDirectory, showNotification]);

  // Set project directory with persistence
  const setProjectDirectory = useCallback(
    async (dir: string) => {
      if (!dir) return;

      try {
        // Normalize the path first
        const normalizedDir = await normalizePath(dir);

        // Compare with current directory and return early if same
        if (normalizedDir === state.projectDirectory) {
          return;
        }

        const now = Date.now();
        const lastChange = lastProjectDirChangeRef.current;

        // Prevent rapid changes (debounce) only for different paths
        if (now - lastChange < PROJECT_DIR_CHANGE_COOLDOWN) {
          return;
        }

        // Update state for immediate UI response
        setState((prev) => ({ ...prev, projectDirectory: normalizedDir }));
        lastProjectDirChangeRef.current = now;

        // Save the directory to persistent storage
        try {
          await saveProjectDirectory(normalizedDir);
        } catch (saveErr) {
          // Don't revert the state as the directory may be valid even if persistence failed
          let persistenceErrorMessage: string;
          if (saveErr instanceof AppError) {
            persistenceErrorMessage = `Project directory set for this session, but failed to save for future sessions: ${saveErr.message}`;
          } else {
            persistenceErrorMessage = `Project directory set for this session, but failed to save for future sessions: ${getErrorMessage(saveErr)}`;
          }
          
          showNotification({
            title: "Persistence Warning",
            message: persistenceErrorMessage,
            type: "warning",
          });
        }
      } catch (err) {
        // Handle AppError instances with their specific properties
        let errorMessage: string;
        if (err instanceof AppError) {
          errorMessage = `Failed to set project directory: ${err.message}`;
        } else {
          errorMessage = `Failed to set project directory: ${getErrorMessage(err)}`;
        }
        
        setState((prev) => ({ ...prev, error: errorMessage }));

        showNotification({
          title: "Error",
          message: errorMessage,
          type: "error",
        });
      }
    },
    [showNotification, saveProjectDirectory, setState, state.projectDirectory]
  );

  return {
    ...state,
    setProjectDirectory,
    isInitialLoadingRef,
  };
}

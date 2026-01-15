"use client";

import { useState, useRef, useCallback, useEffect } from "react";

import { useProjectPersistenceService } from "@/hooks/useProjectPersistenceService";
import { AppError, getErrorMessage } from "@/utils/error-handling";
import { getExternalFoldersAction, setExternalFoldersAction } from "../../actions/project-settings/external-folders.actions";
import { broadcastProjectDirectoryChangedAction } from "../../actions/project-directory";

import { useNotification } from "../notification-context";

export interface ProjectDirectoryState {
  projectDirectory: string;
  isLoading: boolean;
  error: string | null;
}

export interface ProjectDirectoryManager extends ProjectDirectoryState {
  setProjectDirectory: (dir: string) => Promise<void>;
  isInitialLoadingRef: React.RefObject<boolean>;
  externalFolders: string[];
  setExternalFolders: (folders: string[]) => Promise<void>;
}

export function useProjectDirectoryManager(): ProjectDirectoryManager {
  const { showNotification } = useNotification();
  const { loadProjectDirectory, saveProjectDirectory } = useProjectPersistenceService();

  const [state, setState] = useState<ProjectDirectoryState>({
    projectDirectory: "",
    isLoading: true,
    error: null,
  });
  const [externalFolders, setExternalFoldersState] = useState<string[]>([]);

  const isInitialLoadingRef = useRef<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    const loadInitialData = async () => {
      if (!isInitialLoadingRef.current) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const dir = await loadProjectDirectory();

        if (!isMounted) return;

        if (dir) {
          setState((prev) => ({ ...prev, projectDirectory: dir }));
          // Broadcast initial directory to sync with mobile
          await broadcastProjectDirectoryChangedAction(dir);
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err instanceof AppError 
            ? `Failed to load project data: ${err.message}`
            : `Failed to load project data: ${getErrorMessage(err)}`;

          setState((prev) => ({ ...prev, error: errorMessage }));

          showNotification({
            title: "Error",
            message: errorMessage,
            type: "error",
          });
        }
      } finally {
        if (isMounted) {
          isInitialLoadingRef.current = false;
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [loadProjectDirectory, showNotification]);

  useEffect(() => {
    if (!state.projectDirectory) { 
      setExternalFoldersState([]); 
      return; 
    }
    (async () => {
      const res = await getExternalFoldersAction(state.projectDirectory);
      if (res.isSuccess && res.data) setExternalFoldersState(res.data);
    })();
  }, [state.projectDirectory]);

  const setProjectDirectory = useCallback(
    async (dir: string) => {
      if (!dir || dir === state.projectDirectory) return;

      setState((prev) => ({ ...prev, projectDirectory: dir }));

      try {
        await saveProjectDirectory(dir);
        // Broadcast to other connected devices
        await broadcastProjectDirectoryChangedAction(dir);
      } catch (saveErr) {
        const persistenceErrorMessage = saveErr instanceof AppError
          ? `Project directory set for this session, but failed to save for future sessions: ${saveErr.message}`
          : `Project directory set for this session, but failed to save for future sessions: ${getErrorMessage(saveErr)}`;
        
        showNotification({
          title: "Persistence Warning",
          message: persistenceErrorMessage,
          type: "warning",
        });
      }
    },
    [state.projectDirectory, saveProjectDirectory, showNotification]
  );

  const setExternalFolders = useCallback(async (folders: string[]) => {
    if (!state.projectDirectory) return;
    const res = await setExternalFoldersAction(state.projectDirectory, folders);
    if (res.isSuccess) setExternalFoldersState(folders);
  }, [state.projectDirectory]);

  return {
    ...state,
    setProjectDirectory,
    isInitialLoadingRef,
    externalFolders,
    setExternalFolders
  };
}
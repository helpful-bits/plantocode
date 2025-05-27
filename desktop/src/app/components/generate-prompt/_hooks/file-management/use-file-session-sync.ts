"use client";

import { useState, useCallback, useEffect, useMemo } from "react";

import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";

export function useFileSessionSync() {
  const { currentSession } = useSessionStateContext();

  const { updateCurrentSessionFields, setSessionModified, saveCurrentSession } =
    useSessionActionsContext();

  const [searchTerm, setSearchTermState] = useState<string>("");
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnlyState] =
    useState<boolean>(false);

  useEffect(() => {
    // Sync searchTerm from session to local state
    const newSearchTerm = currentSession?.searchTerm ?? "";
    setSearchTermState(newSearchTerm);
  }, [currentSession?.searchTerm]);

  useEffect(() => {
    // Sync searchSelectedFilesOnly from session to local state
    const newSearchSelectedFilesOnly = currentSession?.searchSelectedFilesOnly ?? false;
    setSearchSelectedFilesOnlyState(newSearchSelectedFilesOnly);
  }, [currentSession?.searchSelectedFilesOnly]);

  const updateSearchTerm = useCallback(
    (term: string) => {
      setSearchTermState(term);
      updateCurrentSessionFields({ searchTerm: term });
      setSessionModified(true);
    },
    [updateCurrentSessionFields, setSessionModified]
  );

  const updateSearchSelectedOnly = useCallback(
    (value?: boolean) => {
      // Handle undefined by toggling the current value
      const newValue = value === undefined ? !searchSelectedFilesOnly : value;

      setSearchSelectedFilesOnlyState(newValue);
      updateCurrentSessionFields({ searchSelectedFilesOnly: newValue });
      setSessionModified(true);
    },
    [updateCurrentSessionFields, setSessionModified, searchSelectedFilesOnly]
  );

  const updateIncludedFiles = useCallback(
    (includedPaths: string[]) => {
      // Check if update is needed to avoid unnecessary session modifications
      if (
        JSON.stringify(currentSession?.includedFiles || []) !==
        JSON.stringify(includedPaths)
      ) {
        updateCurrentSessionFields({ includedFiles: includedPaths });
        setSessionModified(true);
        return true;
      }
      return false;
    },
    [
      currentSession?.includedFiles,
      updateCurrentSessionFields,
      setSessionModified,
    ]
  );

  const updateExcludedFiles = useCallback(
    (excludedPaths: string[]) => {
      // Check if update is needed to avoid unnecessary session modifications
      if (
        JSON.stringify(currentSession?.forceExcludedFiles || []) !==
        JSON.stringify(excludedPaths)
      ) {
        updateCurrentSessionFields({ forceExcludedFiles: excludedPaths });
        setSessionModified(true);
        return true;
      }
      return false;
    },
    [
      currentSession?.forceExcludedFiles,
      updateCurrentSessionFields,
      setSessionModified,
    ]
  );

  const syncFileSelectionsToSession = useCallback(
    (includedPaths: string[], excludedPaths: string[]) => {
      // Check if update is needed to avoid unnecessary session modifications
      let changed = false;

      if (updateIncludedFiles(includedPaths)) {
        changed = true;
      }

      if (updateExcludedFiles(excludedPaths)) {
        changed = true;
      }

      return changed;
    },
    [updateIncludedFiles, updateExcludedFiles]
  );

  const getFileStateForSession = useCallback(() => {
    return {
      searchTerm: currentSession?.searchTerm || "",
      includedFiles: currentSession?.includedFiles || [],
      forceExcludedFiles: currentSession?.forceExcludedFiles || [],
      searchSelectedFilesOnly: currentSession?.searchSelectedFilesOnly || false,
    };
  }, [currentSession]);

  const flushFileStateSaves = useCallback(async () => {
    if (!currentSession?.id) {
      return false;
    }

    try {
      // Save the session to persist all pending changes
      return await saveCurrentSession();
    } catch (error) {
      console.error("[useFileSessionSync] Error saving session:", error);
      return false;
    }
  }, [currentSession?.id, saveCurrentSession]);

  return useMemo(
    () => ({
      // State
      searchTerm,
      searchSelectedFilesOnly,

      // Update methods
      updateSearchTerm,
      updateSearchSelectedOnly,
      updateIncludedFiles,
      updateExcludedFiles,
      syncFileSelectionsToSession,

      // Session access
      getFileStateForSession,
      flushFileStateSaves,

      // Expose current session's file lists directly for reading
      sessionIncludedFiles: currentSession?.includedFiles || [],
      sessionForceExcludedFiles: currentSession?.forceExcludedFiles || [],
    }),
    [
      searchTerm,
      searchSelectedFilesOnly,
      updateSearchTerm,
      updateSearchSelectedOnly,
      updateIncludedFiles,
      updateExcludedFiles,
      syncFileSelectionsToSession,
      getFileStateForSession,
      flushFileStateSaves,
      currentSession?.includedFiles,
      currentSession?.forceExcludedFiles,
    ]
  );
}

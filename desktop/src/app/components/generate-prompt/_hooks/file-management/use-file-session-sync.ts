"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";

import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";
import { areArraysEqual } from "@/utils/array-utils";

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
      // Correctly call updateCurrentSessionFields and setSessionModified to ensure changes are reflected in global session state
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
      // Correctly call updateCurrentSessionFields and setSessionModified to ensure changes are reflected in global session state and marked for saving
      updateCurrentSessionFields({ searchSelectedFilesOnly: newValue });
      setSessionModified(true);
    },
    [updateCurrentSessionFields, setSessionModified, searchSelectedFilesOnly]
  );

  const updateIncludedFiles = useCallback(
    (includedPaths: string[]) => {
      const currentFiles = currentSession?.includedFiles || [];
      if (!areArraysEqual(currentFiles, includedPaths)) {
        updateCurrentSessionFields({ includedFiles: includedPaths });
        return true;
      }
      return false;
    },
    [currentSession?.includedFiles, updateCurrentSessionFields]
  );

  const updateExcludedFiles = useCallback(
    (excludedPaths: string[]) => {
      const currentFiles = currentSession?.forceExcludedFiles || [];
      if (!areArraysEqual(currentFiles, excludedPaths)) {
        updateCurrentSessionFields({ forceExcludedFiles: excludedPaths });
        return true;
      }
      return false;
    },
    [currentSession?.forceExcludedFiles, updateCurrentSessionFields]
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
      // Save current session - no need to flush pending updates since we update immediately
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

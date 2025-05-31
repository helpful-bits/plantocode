"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";

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

  // Use refs to avoid expensive array comparisons
  const lastIncludedFilesRef = useRef<string[]>([]);
  const lastExcludedFilesRef = useRef<string[]>([]);
  
  // Fast array equality check without JSON.stringify
  const areArraysEqual = useCallback((arr1: string[], arr2: string[]): boolean => {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    return true;
  }, []);

  // Debounced session update to avoid backend calls on every click
  const debouncedSessionUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIncludedRef = useRef<string[] | null>(null);
  const pendingExcludedRef = useRef<string[] | null>(null);
  
  const flushPendingUpdates = useCallback(() => {
    if (pendingIncludedRef.current !== null || pendingExcludedRef.current !== null) {
      const updates: Partial<any> = {};
      
      if (pendingIncludedRef.current !== null) {
        updates.includedFiles = pendingIncludedRef.current;
        pendingIncludedRef.current = null;
      }
      
      if (pendingExcludedRef.current !== null) {
        updates.forceExcludedFiles = pendingExcludedRef.current;
        pendingExcludedRef.current = null;
      }
      
      updateCurrentSessionFields(updates);
      setSessionModified(true);
    }
  }, [updateCurrentSessionFields, setSessionModified]);
  
  const scheduleDebouncedUpdate = useCallback(() => {
    if (debouncedSessionUpdateRef.current) {
      clearTimeout(debouncedSessionUpdateRef.current);
    }
    
    debouncedSessionUpdateRef.current = setTimeout(() => {
      flushPendingUpdates();
    }, 100); // Much shorter debounce for responsiveness
  }, [flushPendingUpdates]);

  const updateIncludedFiles = useCallback(
    (includedPaths: string[]) => {
      // Fast equality check using array comparison instead of JSON.stringify
      const currentFiles = currentSession?.includedFiles || [];
      if (!areArraysEqual(currentFiles, includedPaths)) {
        // Update ref for next comparison
        lastIncludedFilesRef.current = includedPaths;
        
        // Store pending update instead of immediately calling backend
        pendingIncludedRef.current = includedPaths;
        scheduleDebouncedUpdate();
        
        return true;
      }
      return false;
    },
    [
      currentSession?.includedFiles,
      areArraysEqual,
      scheduleDebouncedUpdate,
    ]
  );

  const updateExcludedFiles = useCallback(
    (excludedPaths: string[]) => {
      // Fast equality check using array comparison instead of JSON.stringify
      const currentFiles = currentSession?.forceExcludedFiles || [];
      if (!areArraysEqual(currentFiles, excludedPaths)) {
        // Update ref for next comparison
        lastExcludedFilesRef.current = excludedPaths;
        
        // Store pending update instead of immediately calling backend
        pendingExcludedRef.current = excludedPaths;
        scheduleDebouncedUpdate();
        
        return true;
      }
      return false;
    },
    [
      currentSession?.forceExcludedFiles,
      areArraysEqual,
      scheduleDebouncedUpdate,
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
    // First flush any pending debounced updates
    if (debouncedSessionUpdateRef.current) {
      clearTimeout(debouncedSessionUpdateRef.current);
      debouncedSessionUpdateRef.current = null;
      flushPendingUpdates();
    }
    
    if (!currentSession?.id) {
      return false;
    }

    try {
      // Correctly call saveCurrentSession to persist all pending changes
      return await saveCurrentSession();
    } catch (error) {
      console.error("[useFileSessionSync] Error saving session:", error);
      return false;
    }
  }, [currentSession?.id, saveCurrentSession, flushPendingUpdates]);

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
      
      // Expose flush function for immediate updates when needed
      flushPendingUpdates,
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
      flushPendingUpdates,
    ]
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { listProjectFilesAction } from "@/actions/file-system/list-project-files.action";
import { getFileSelectionHistoryAction, syncFileSelectionHistoryAction, type FileSelectionHistoryEntry } from "@/actions/session/history.actions";
import { areArraysEqual } from "@/utils/array-utils";

// File info from filesystem (without selection state)
interface FileInfo {
  path: string;        // RELATIVE from project root
  name: string;
  size?: number;
  modifiedAt?: number;
  isBinary: boolean;
}

// Extended interface for UI state - includes selection state
interface ExtendedFileInfo extends FileInfo {
  included: boolean;
  excluded: boolean;
}


/**
 * EXTREMELY SIMPLE file selection hook
 * No caching, no complex state management, no transformations
 * Just files, selection state, and direct database saves
 */
export function useFileSelection(projectDirectory?: string) {
  const { currentSession } = useSessionStateContext();
  const { updateCurrentSessionFields } = useSessionActionsContext();
  
  const [allProjectFiles, setAllProjectFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "selected">(currentSession?.filterMode || "all");
  const [sortBy, setSortBy] = useState<"name" | "size" | "modified">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
  // History for undo/redo
  const [historyState, setHistoryState] = useState<{ entries: FileSelectionHistoryEntry[], currentIndex: number }>({ entries: [], currentIndex: -1 });
  const isUndoRedoInProgress = useRef(false);
  const historyStateRef = useRef(historyState);
  
  // Create stable references for current session data
  const sessionIncluded = useMemo(() => currentSession?.includedFiles || [], [currentSession?.includedFiles]);
  const sessionExcluded = useMemo(() => currentSession?.forceExcludedFiles || [], [currentSession?.forceExcludedFiles]);
  
  // Handle filter mode changes with persistence
  const handleSetFilterMode = useCallback((newMode: "all" | "selected") => {
    setFilterMode(newMode);
    updateCurrentSessionFields({ filterMode: newMode });
  }, [updateCurrentSessionFields]);
  
  // Computed files that combines filesystem data with session selection state
  const files = useMemo((): ExtendedFileInfo[] => {
    const includedSet = new Set(sessionIncluded);
    const excludedSet = new Set(sessionExcluded);
    
    return allProjectFiles.map(file => ({
      ...file,
      included: includedSet.has(file.path),
      excluded: excludedSet.has(file.path),
    }));
  }, [allProjectFiles, sessionIncluded, sessionExcluded]);

  // Load files from file system 
  const loadFiles = useCallback(async () => {
    if (!projectDirectory) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await listProjectFilesAction({ projectDirectory });

      if (!result.isSuccess || !result.data) {
        throw new Error(result.message || "Failed to load files");
      }

      // Store filesystem data without selection state
      setAllProjectFiles(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectDirectory]);

  // Refresh function that reloads files from filesystem
  const refreshFiles = useCallback(() => {
    loadFiles();
  }, [loadFiles]);

  // Load files when project directory changes
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Use a ref to access current allProjectFiles without causing effect re-runs
  const allProjectFilesRef = useRef(allProjectFiles);
  useEffect(() => {
    allProjectFilesRef.current = allProjectFiles;
  }, [allProjectFiles]);

  // Listen for file selection applied events and switch to selected view
  useEffect(() => {
    const handleFileSelectionApplied = () => {
      // Always switch to selected mode when files are applied
      // The filteredAndSortedFiles will handle showing files even if allProjectFiles is empty
      handleSetFilterMode("selected");
      
      // If allProjectFiles is empty, trigger a load (but don't wait for it)
      // The UI will update when the files are loaded thanks to React's reactivity
      // Use ref to get current value without causing effect dependencies
      if (allProjectFilesRef.current.length === 0 && projectDirectory) {
        loadFiles();
      }
    };

    window.addEventListener("file-selection-applied", handleFileSelectionApplied);

    return () => {
      window.removeEventListener("file-selection-applied", handleFileSelectionApplied);
    };
  }, [handleSetFilterMode, projectDirectory, loadFiles]);

  // Sync filter mode when currentSession.filterMode changes externally
  useEffect(() => {
    if (currentSession?.filterMode && currentSession.filterMode !== filterMode) {
      setFilterMode(currentSession.filterMode);
    }
  }, [currentSession?.filterMode, filterMode]);

  // Load history when session changes
  useEffect(() => {
    if (currentSession?.id) {
      getFileSelectionHistoryAction(currentSession.id).then(result => {
        if (result.isSuccess && result.data) {
          const entries = result.data.map(entry => ({
            includedFiles: entry.includedFiles,
            forceExcludedFiles: entry.forceExcludedFiles
          }));
          
          const currentSessionState = {
            includedFiles: sessionIncluded,
            forceExcludedFiles: sessionExcluded
          };
          
          const lastEntry = entries[entries.length - 1];
          if (!lastEntry || 
              !areArraysEqual([...currentSessionState.includedFiles].sort(), [...lastEntry.includedFiles].sort()) ||
              !areArraysEqual([...currentSessionState.forceExcludedFiles].sort(), [...lastEntry.forceExcludedFiles].sort())) {
            entries.push(currentSessionState);
          }
          
          setHistoryState({ entries, currentIndex: entries.length - 1 });
        }
      });
    }
  }, [currentSession?.id, sessionIncluded, sessionExcluded]);


  useEffect(() => {
    historyStateRef.current = historyState;
  }, [historyState]);

  useEffect(() => {
    const flushHistory = () => {
      if (currentSession?.id && historyStateRef.current.entries.length > 0) {
        syncFileSelectionHistoryAction(currentSession.id, historyStateRef.current.entries);
      }
    };

    window.addEventListener('flush-file-selection-history', flushHistory);

    return () => {
      window.removeEventListener('flush-file-selection-history', flushHistory);
    };
  }, [currentSession?.id]);

  useEffect(() => {
    if (currentSession?.id && historyState.entries.length > 0 && !isUndoRedoInProgress.current) {
      syncFileSelectionHistoryAction(currentSession.id, historyState.entries);
    }
  }, [historyState, currentSession?.id]);

  // Declarative history management
  useEffect(() => {
    setHistoryState(prevState => {
      if (isUndoRedoInProgress.current) {
        isUndoRedoInProgress.current = false;
        return prevState;
      }
      
      const currentState = {
        includedFiles: sessionIncluded,
        forceExcludedFiles: sessionExcluded
      };
      
      const currentEntry = prevState.entries[prevState.currentIndex];
      if (currentEntry &&
          areArraysEqual([...currentState.includedFiles].sort(), [...currentEntry.includedFiles].sort()) &&
          areArraysEqual([...currentState.forceExcludedFiles].sort(), [...currentEntry.forceExcludedFiles].sort())) {
        return prevState;
      }
      
      const newEntries = prevState.entries.slice(0, prevState.currentIndex + 1);
      newEntries.push(currentState);
      const limitedEntries = newEntries.slice(-50);
      
      return {
        entries: limitedEntries,
        currentIndex: limitedEntries.length - 1
      };
    });
  }, [sessionIncluded, sessionExcluded]);

  // Toggle file inclusion
  const toggleFileSelection = useCallback((path: string) => {
    const currentFile = files.find(f => f.path === path);
    if (!currentFile) return;
    
    const newIncluded = !currentFile.included;
    const currentIncluded = currentSession?.includedFiles || [];
    const currentExcluded = currentSession?.forceExcludedFiles || [];
    
    let newIncludedFiles: string[];
    let newExcludedFiles: string[];
    
    if (newIncluded) {
      // Add to included, remove from excluded
      newIncludedFiles = [...currentIncluded.filter(p => p !== path), path];
      newExcludedFiles = currentExcluded.filter(p => p !== path);
    } else {
      // Remove from included
      newIncludedFiles = currentIncluded.filter(p => p !== path);
      newExcludedFiles = currentExcluded;
    }
    
    updateCurrentSessionFields({
      includedFiles: newIncludedFiles,
      forceExcludedFiles: newExcludedFiles
    });
  }, [files, currentSession, updateCurrentSessionFields]);

  // Toggle file exclusion
  const toggleFileExclusion = useCallback((path: string) => {
    const currentFile = files.find(f => f.path === path);
    if (!currentFile) return;
    
    const newExcluded = !currentFile.excluded;
    const currentIncluded = currentSession?.includedFiles || [];
    const currentExcluded = currentSession?.forceExcludedFiles || [];
    
    let newIncludedFiles: string[];
    let newExcludedFiles: string[];
    
    if (newExcluded) {
      // Add to excluded, remove from included
      newExcludedFiles = [...currentExcluded.filter(p => p !== path), path];
      newIncludedFiles = currentIncluded.filter(p => p !== path);
    } else {
      // Remove from excluded
      newExcludedFiles = currentExcluded.filter(p => p !== path);
      newIncludedFiles = currentIncluded;
    }
    
    updateCurrentSessionFields({
      includedFiles: newIncludedFiles,
      forceExcludedFiles: newExcludedFiles
    });
  }, [files, currentSession, updateCurrentSessionFields]);

  // Undo functionality
  const undo = useCallback(() => {
    if (historyState.currentIndex > 0) {
      const newIndex = historyState.currentIndex - 1;
      const prevState = historyState.entries[newIndex];
      setHistoryState(prev => ({ ...prev, currentIndex: newIndex }));
      isUndoRedoInProgress.current = true;
      updateCurrentSessionFields({
        includedFiles: prevState.includedFiles,
        forceExcludedFiles: prevState.forceExcludedFiles
      });
    }
  }, [historyState, updateCurrentSessionFields]);

  // Redo functionality
  const redo = useCallback(() => {
    if (historyState.currentIndex < historyState.entries.length - 1) {
      const newIndex = historyState.currentIndex + 1;
      const nextState = historyState.entries[newIndex];
      setHistoryState(prev => ({ ...prev, currentIndex: newIndex }));
      isUndoRedoInProgress.current = true;
      updateCurrentSessionFields({
        includedFiles: nextState.includedFiles,
        forceExcludedFiles: nextState.forceExcludedFiles
      });
    }
  }, [historyState, updateCurrentSessionFields]);

  // Sort function
  const sortFiles = useCallback((filesToSort: ExtendedFileInfo[]) => {
    return [...filesToSort].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "name":
          comparison = a.path.localeCompare(b.path);
          break;
        case "size":
          const sizeA = a.size ?? 0;
          const sizeB = b.size ?? 0;
          comparison = sizeA - sizeB;
          break;
        case "modified":
          const modA = a.modifiedAt ?? 0;
          const modB = b.modifiedAt ?? 0;
          comparison = modA - modB;
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [sortBy, sortOrder]);

  // Filter and sort files
  const filteredAndSortedFiles = useMemo(() => {
    let filesToProcess = files;
    
    // In "selected" mode, if we have sessionIncluded files that aren't in allProjectFiles,
    // create temporary file entries for them so they can be displayed
    if (filterMode === "selected" && sessionIncluded.length > 0) {
      const existingPaths = new Set(files.map(f => f.path));
      const missingSelectedFiles = sessionIncluded
        .filter(path => !existingPaths.has(path))
        .map(path => ({
          path,
          name: path.split('/').pop() || path,
          size: undefined,
          modifiedAt: undefined,
          isBinary: false,
          included: true,
          excluded: sessionExcluded.includes(path)
        }));
      
      if (missingSelectedFiles.length > 0) {
        filesToProcess = [...files, ...missingSelectedFiles];
      }
    }
    
    // First filter
    const filtered = filesToProcess.filter(file => {
      // Search filter
      const matchesSearch = file.path.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filter mode filter
      const matchesFilter = filterMode === "all" || (filterMode === "selected" && file.included && !file.excluded);
      
      return matchesSearch && matchesFilter;
    });
    
    // Then sort
    return sortFiles(filtered);
  }, [files, searchTerm, filterMode, sortFiles, sessionIncluded, sessionExcluded]);

  // Count from all files, not just filtered
  // Also count files in sessionIncluded that might not be in allProjectFiles yet
  const includedCount = useMemo(() => {
    // Count files that are in both allProjectFiles and included
    const filesIncludedCount = files.filter(f => f.included && !f.excluded).length;
    
    // If we have files in sessionIncluded but not in allProjectFiles, use sessionIncluded count
    // This handles the case where files are selected from jobs but allProjectFiles hasn't loaded yet
    if (sessionIncluded.length > 0 && filesIncludedCount === 0) {
      // Filter out any that are in sessionExcluded
      const excludedSet = new Set(sessionExcluded);
      return sessionIncluded.filter(path => !excludedSet.has(path)).length;
    }
    
    return filesIncludedCount;
  }, [files, sessionIncluded, sessionExcluded]);



  // Select filtered files only
  const selectFiltered = useCallback(() => {
    
    const filteredPaths = new Set(filteredAndSortedFiles.map(f => f.path));
    const currentIncluded = currentSession?.includedFiles || [];
    const currentExcluded = currentSession?.forceExcludedFiles || [];
    
    // Add filtered paths to included, remove from excluded
    const newIncluded = [...new Set([...currentIncluded, ...Array.from(filteredPaths)])];
    const newExcluded = currentExcluded.filter(path => !filteredPaths.has(path));
    
    updateCurrentSessionFields({ 
      includedFiles: newIncluded,
      forceExcludedFiles: newExcluded
    });
  }, [updateCurrentSessionFields, filteredAndSortedFiles, currentSession]);

  // Deselect filtered files only
  const deselectFiltered = useCallback(() => {
    
    const filteredPaths = new Set(filteredAndSortedFiles.map(f => f.path));
    const currentIncluded = currentSession?.includedFiles || [];
    const currentExcluded = currentSession?.forceExcludedFiles || [];
    
    // Remove filtered paths from included and excluded
    const newIncluded = currentIncluded.filter(path => !filteredPaths.has(path));
    const newExcluded = currentExcluded.filter(path => !filteredPaths.has(path));
    
    updateCurrentSessionFields({ 
      includedFiles: newIncluded,
      forceExcludedFiles: newExcluded
    });
  }, [updateCurrentSessionFields, filteredAndSortedFiles, currentSession]);


  return {
    files: filteredAndSortedFiles,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    filterMode,
    setFilterMode: handleSetFilterMode,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    toggleFileSelection,
    toggleFileExclusion,
    refreshFiles,
    includedCount,
    totalCount: allProjectFiles.length,
    undo,
    redo,
    canUndo: historyState.currentIndex > 0,
    canRedo: historyState.currentIndex < historyState.entries.length - 1,
    selectFiltered,
    deselectFiltered,
  };
}
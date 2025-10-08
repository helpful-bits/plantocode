"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { listProjectFilesAction } from "@/actions/file-system/list-project-files.action";
import { getFilesMetadata } from "@/utils/tauri-fs";
import { getFileSelectionHistoryAction, syncFileSelectionHistoryAction, type FileSelectionHistoryEntry } from "@/actions/session/history.actions";
import { areArraysEqual } from "@/utils/array-utils";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { updateSessionFilesAction } from "@/actions/session/update-files.actions";

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
  const applyingRemoteRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // History for undo/redo - now with timestamps for each entry
  const [historyState, setHistoryState] = useState<{ entries: (FileSelectionHistoryEntry & { createdAt: number })[], currentIndex: number }>({ entries: [], currentIndex: -1 });
  const isUndoRedoInProgress = useRef(false);
  const historyStateRef = useRef(historyState);
  const historyInitialized = useRef(false);
  const historySessionIdRef = useRef<string | null>(null);
  
  // Create stable references for current session data
  const sessionIncluded = useMemo(() => currentSession?.includedFiles || [], [currentSession?.includedFiles]);
  const sessionExcluded = useMemo(() => currentSession?.forceExcludedFiles || [], [currentSession?.forceExcludedFiles]);

  const broadcastBrowserState = useCallback(async () => {
    if (!currentSession?.id || !projectDirectory || applyingRemoteRef.current) {
      return;
    }

    try {
      await invoke("broadcast_file_browser_state_command", {
        sessionId: currentSession.id,
        projectDirectory: projectDirectory,
        searchTerm: searchTerm || null,
        sortBy: sortBy,
        sortOrder: sortOrder,
        filterMode: filterMode,
      });
    } catch (err) {
      console.error("Failed to broadcast browser state:", err);
    }
  }, [currentSession?.id, projectDirectory, searchTerm, sortBy, sortOrder, filterMode]);

  const debouncedBroadcast = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      broadcastBrowserState();
    }, 300);
  }, [broadcastBrowserState]);

  // Handle filter mode changes with persistence
  const handleSetFilterMode = useCallback((newMode: "all" | "selected") => {
    setFilterMode(newMode);
    updateCurrentSessionFields({ filterMode: newMode });
  }, [updateCurrentSessionFields]);

  useEffect(() => {
    if (!applyingRemoteRef.current) {
      debouncedBroadcast();
    }
  }, [searchTerm, debouncedBroadcast]);

  useEffect(() => {
    if (!applyingRemoteRef.current) {
      broadcastBrowserState();
    }
  }, [filterMode, sortBy, sortOrder, broadcastBrowserState]);

  // State for external files metadata
  const [externalFilesMetadata, setExternalFilesMetadata] = useState<Map<string, FileInfo>>(new Map());

  // Computed files that combines filesystem data with session selection state
  const files = useMemo((): ExtendedFileInfo[] => {
    const includedSet = new Set(sessionIncluded);
    const excludedSet = new Set(sessionExcluded);

    // First, map all project files
    const projectFiles = allProjectFiles.map(file => ({
      ...file,
      included: includedSet.has(file.path),
      excluded: excludedSet.has(file.path),
    }));

    // Then, add external files from metadata if they exist
    const projectFilePaths = new Set(allProjectFiles.map(f => f.path));
    const externalFiles: ExtendedFileInfo[] = [];

    for (const path of sessionIncluded) {
      if (!projectFilePaths.has(path)) {
        // This is an external file, get its metadata
        const metadata = externalFilesMetadata.get(path);
        if (metadata) {
          externalFiles.push({
            ...metadata,
            included: true,
            excluded: excludedSet.has(path),
          });
        }
      }
    }

    return [...projectFiles, ...externalFiles];
  }, [allProjectFiles, sessionIncluded, sessionExcluded, externalFilesMetadata]);

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

  // Load metadata for external files when sessionIncluded changes
  useEffect(() => {
    if (!projectDirectory || sessionIncluded.length === 0) {
      setExternalFilesMetadata(new Map());
      return;
    }

    // Find paths that look like external files (absolute paths not in project)
    const externalPaths = sessionIncluded.filter(path => {
      // Check if it's an absolute path
      return path.startsWith('/') || (path.match(/^[A-Z]:\\/)); // Unix or Windows absolute path
    });

    if (externalPaths.length === 0) {
      setExternalFilesMetadata(new Map());
      return;
    }

    // Fetch metadata for external files
    getFilesMetadata(externalPaths, projectDirectory)
      .then(metadataList => {
        const metadataMap = new Map<string, FileInfo>();
        for (const fileInfo of metadataList) {
          // Store with the original absolute path as key
          const originalPath = externalPaths.find(p => p.endsWith(fileInfo.path) || fileInfo.path === p);
          if (originalPath) {
            metadataMap.set(originalPath, {
              path: originalPath, // Use the original absolute path
              name: fileInfo.name,
              size: fileInfo.size,
              modifiedAt: fileInfo.modifiedAt,
              isBinary: fileInfo.isBinary,
            });
          }
        }
        setExternalFilesMetadata(metadataMap);
      })
      .catch(err => {
        console.error('Failed to fetch external files metadata:', err);
        setExternalFilesMetadata(new Map());
      });
  }, [sessionIncluded, projectDirectory]);

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

  // Load history when session ID changes (only once per session)
  useEffect(() => {
    const sessionId = currentSession?.id ?? null;
    historySessionIdRef.current = sessionId;
    historyInitialized.current = false;
    isUndoRedoInProgress.current = false;

    setHistoryState({ entries: [], currentIndex: -1 });

    if (!sessionId) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await getFileSelectionHistoryAction(sessionId);

        if (cancelled || historySessionIdRef.current !== sessionId) {
          return;
        }

        if (result.isSuccess && result.data) {
          const entries = result.data.map(entry => ({
            includedFiles: entry.includedFiles,
            forceExcludedFiles: entry.forceExcludedFiles,
            createdAt: entry.createdAt
          }));

          historyInitialized.current = true;
          setHistoryState({ entries, currentIndex: entries.length - 1 });
        } else {
          historyInitialized.current = true;
        }
      } catch (err) {
        console.warn('Failed to load file selection history for session', sessionId, err);
        if (!cancelled && historySessionIdRef.current === sessionId) {
          historyInitialized.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentSession?.id]);


  useEffect(() => {
    historyStateRef.current = historyState;
  }, [historyState]);

  useEffect(() => {
    const flushHistory = () => {
      if (!currentSession?.id) {
        return;
      }
      if (historySessionIdRef.current !== currentSession.id) {
        return;
      }
      if (!historyInitialized.current) {
        return;
      }
      if (historyStateRef.current.entries.length === 0) {
        return;
      }

      syncFileSelectionHistoryAction(currentSession.id, historyStateRef.current.entries);
    };

    window.addEventListener('flush-file-selection-history', flushHistory);

    return () => {
      window.removeEventListener('flush-file-selection-history', flushHistory);
    };
  }, [currentSession?.id]);

  useEffect(() => {
    if (!currentSession?.id) {
      return;
    }
    if (historySessionIdRef.current !== currentSession.id) {
      return;
    }
    if (!historyInitialized.current) {
      return;
    }
    if (historyState.entries.length === 0) {
      return;
    }
    if (isUndoRedoInProgress.current) {
      return;
    }

    syncFileSelectionHistoryAction(currentSession.id, historyState.entries);
  }, [historyState, currentSession?.id]);

  // Declarative history management
  useEffect(() => {
    // Don't create history entries until history is initialized from DB
    if (!historyInitialized.current) {
      return;
    }

    setHistoryState(prevState => {
      if (isUndoRedoInProgress.current) {
        isUndoRedoInProgress.current = false;
        return prevState;
      }

      const currentState = {
        includedFiles: sessionIncluded,
        forceExcludedFiles: sessionExcluded,
        createdAt: Date.now()
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
    if (!currentFile || !currentSession) return;

    const newIncluded = !currentFile.included;

    if (newIncluded) {
      updateSessionFilesAction(currentSession.id, {
        addIncluded: [path],
        removeExcluded: [path],
      });
    } else {
      updateSessionFilesAction(currentSession.id, {
        removeIncluded: [path],
      });
    }
  }, [files, currentSession]);

  // Toggle file exclusion
  const toggleFileExclusion = useCallback((path: string) => {
    const currentFile = files.find(f => f.path === path);
    if (!currentFile || !currentSession) return;

    const newExcluded = !currentFile.excluded;

    if (newExcluded) {
      updateSessionFilesAction(currentSession.id, {
        addExcluded: [path],
        removeIncluded: [path],
      });
    } else {
      updateSessionFilesAction(currentSession.id, {
        removeExcluded: [path],
      });
    }
  }, [files, currentSession]);

  // Undo functionality
  const undo = useCallback(() => {
    if (historyState.currentIndex <= 0) {
      return;
    }

    const newIndex = historyState.currentIndex - 1;
    const prevState = historyState.entries[newIndex];
    if (!prevState) {
      return;
    }

    setHistoryState(prev => ({ ...prev, currentIndex: newIndex }));

    const currentIncluded = currentSession?.includedFiles || [];
    const currentExcluded = currentSession?.forceExcludedFiles || [];
    const includedUnchanged = areArraysEqual([...currentIncluded].sort(), [...prevState.includedFiles].sort());
    const excludedUnchanged = areArraysEqual([...currentExcluded].sort(), [...prevState.forceExcludedFiles].sort());

    if (includedUnchanged && excludedUnchanged) {
      isUndoRedoInProgress.current = false;
      return;
    }

    isUndoRedoInProgress.current = true;
    updateCurrentSessionFields({
      includedFiles: prevState.includedFiles,
      forceExcludedFiles: prevState.forceExcludedFiles
    });
  }, [historyState, updateCurrentSessionFields, currentSession?.includedFiles, currentSession?.forceExcludedFiles]);

  // Redo functionality
  const redo = useCallback(() => {
    if (historyState.currentIndex >= historyState.entries.length - 1) {
      return;
    }

    const newIndex = historyState.currentIndex + 1;
    const nextState = historyState.entries[newIndex];
    if (!nextState) {
      return;
    }

    setHistoryState(prev => ({ ...prev, currentIndex: newIndex }));

    const currentIncluded = currentSession?.includedFiles || [];
    const currentExcluded = currentSession?.forceExcludedFiles || [];
    const includedUnchanged = areArraysEqual([...currentIncluded].sort(), [...nextState.includedFiles].sort());
    const excludedUnchanged = areArraysEqual([...currentExcluded].sort(), [...nextState.forceExcludedFiles].sort());

    if (includedUnchanged && excludedUnchanged) {
      isUndoRedoInProgress.current = false;
      return;
    }

    isUndoRedoInProgress.current = true;
    updateCurrentSessionFields({
      includedFiles: nextState.includedFiles,
      forceExcludedFiles: nextState.forceExcludedFiles
    });
  }, [historyState, updateCurrentSessionFields, currentSession?.includedFiles, currentSession?.forceExcludedFiles]);

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

    // In "selected" mode, if we have sessionIncluded files that aren't in our files array yet
    // (because external metadata hasn't loaded), create temporary entries
    if (filterMode === "selected" && sessionIncluded.length > 0) {
      const existingPaths = new Set(files.map(f => f.path));
      const missingSelectedFiles = sessionIncluded
        .filter(path => !existingPaths.has(path))
        .map(path => {
          // Check if we have metadata for this external file
          const metadata = externalFilesMetadata.get(path);
          if (metadata) {
            return {
              ...metadata,
              included: true,
              excluded: sessionExcluded.includes(path)
            };
          }
          // Create temporary entry if metadata not loaded yet
          return {
            path,
            name: path.split('/').pop() || path,
            size: undefined,
            modifiedAt: undefined,
            isBinary: false,
            included: true,
            excluded: sessionExcluded.includes(path)
          };
        });

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
  }, [files, searchTerm, filterMode, sortFiles, sessionIncluded, sessionExcluded, externalFilesMetadata]);

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
    if (!currentSession) return;

    const filteredPaths = filteredAndSortedFiles.map(f => f.path);
    const currentIncluded = currentSession.includedFiles || [];

    const pathsToInclude = filteredPaths.filter(path => !currentIncluded.includes(path));

    if (pathsToInclude.length > 0) {
      updateSessionFilesAction(currentSession.id, {
        addIncluded: pathsToInclude,
        removeExcluded: filteredPaths,
      });
    }
  }, [currentSession, filteredAndSortedFiles]);

  // Deselect filtered files only
  const deselectFiltered = useCallback(() => {
    if (!currentSession) return;

    const filteredPaths = filteredAndSortedFiles.map(f => f.path);
    const currentIncluded = currentSession.includedFiles || [];

    const pathsToRemove = filteredPaths.filter(path => currentIncluded.includes(path));

    if (pathsToRemove.length > 0) {
      updateSessionFilesAction(currentSession.id, {
        removeIncluded: pathsToRemove,
      });
    }
  }, [currentSession, filteredAndSortedFiles]);

  // Exclude filtered files only
  const excludeFiltered = useCallback(() => {
    if (!currentSession) return;

    const filteredPaths = filteredAndSortedFiles.map(f => f.path);
    const currentExcluded = currentSession.forceExcludedFiles || [];

    const pathsToExclude = filteredPaths.filter(path => !currentExcluded.includes(path));

    if (pathsToExclude.length > 0) {
      updateSessionFilesAction(currentSession.id, {
        addExcluded: filteredPaths,
        removeIncluded: filteredPaths,
      });
    }
  }, [currentSession, filteredAndSortedFiles]);

  // Unexclude filtered files only
  const unexcludeFiltered = useCallback(() => {
    if (!currentSession) return;

    const filteredPaths = filteredAndSortedFiles.map(f => f.path);
    const currentExcluded = currentSession.forceExcludedFiles || [];

    const pathsToUnexclude = filteredPaths.filter(path => currentExcluded.includes(path));

    if (pathsToUnexclude.length > 0) {
      updateSessionFilesAction(currentSession.id, {
        removeExcluded: pathsToUnexclude,
      });
    }
  }, [currentSession, filteredAndSortedFiles]);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<{
          sessionId: string;
          projectDirectory: string;
          searchTerm?: string;
          sortBy?: string;
          sortOrder?: string;
          filterMode?: string;
        }>("session-file-browser-state-updated", (event) => {
          const p = event.payload;

          if (!currentSession?.id || p.sessionId !== currentSession.id) {
            return;
          }

          applyingRemoteRef.current = true;

          if (p.searchTerm != null && p.searchTerm !== searchTerm) {
            setSearchTerm(p.searchTerm);
          }

          if (p.filterMode != null && p.filterMode !== filterMode) {
            setFilterMode(p.filterMode as "all" | "selected");
          }

          if (p.sortBy != null && p.sortBy !== sortBy) {
            setSortBy(p.sortBy as "name" | "size" | "modified");
          }

          if (p.sortOrder != null && p.sortOrder !== sortOrder) {
            setSortOrder(p.sortOrder as "asc" | "desc");
          }

          setTimeout(() => {
            applyingRemoteRef.current = false;
          }, 100);
        });
      } catch (err) {
        console.error("Failed to setup browser state listener:", err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentSession?.id, searchTerm, filterMode, sortBy, sortOrder, setFilterMode]);

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
    excludeFiltered,
    unexcludeFiltered,
  };
}

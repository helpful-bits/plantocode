"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { listProjectFilesAction } from "@/actions/file-system/list-project-files.action";
import { getFilesMetadata } from "@/utils/tauri-fs";
import {
  getHistoryStateAction,
  syncHistoryStateAction,
  getDeviceIdAction,
} from "@/actions/session/history.actions";
import { areArraysEqual } from "@/utils/array-utils";
import { isLikelyAbsolutePath } from "@/utils/path-utils";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

// Debounce utility
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function(...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

const safeParseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
};

const FILE_HISTORY_MAX_ENTRIES = 50;

const nextSequenceNumber = (entries: FileHistoryEntry[], deviceId?: string): number => {
  const targetId = deviceId?.toLowerCase();
  let max = -1;
  for (const entry of entries) {
    if (targetId && entry.deviceId?.toLowerCase() !== targetId) {
      continue;
    }
    if (typeof entry.sequenceNumber === "number" && entry.sequenceNumber > max) {
      max = entry.sequenceNumber;
    }
  }
  return max + 1;
};

const normalizeFileList = (values: string[]) => {
  return Array.from(new Set(values)).sort();
};

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

// New HistoryState interfaces - matches documented schema
interface FileHistoryEntry {
  includedFiles: string[];       // Note: Backend stores as JSON string, but we keep as array here
  forceExcludedFiles: string[];  // Note: Backend stores as JSON string, but we keep as array here
  timestampMs: number;            // Matches documented schema timestampMs
  deviceId: string;
  opType: string;
  sequenceNumber: number;
}

interface FileHistoryState {
  entries: FileHistoryEntry[];
  currentIndex: number;
  version: number;
  checksum: string;
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

  // New HistoryState management
  const [historyState, setHistoryState] = useState<FileHistoryState>({
    entries: [],
    currentIndex: 0,
    version: 1,
    checksum: '',
  });
  const [deviceId, setDeviceId] = useState<string>('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const isActivelyModifyingRef = useRef(false);
  const isNavigatingHistoryRef = useRef(false);
  const isUndoRedoInProgress = useRef(false);
  const remoteHistoryApplyingRef = useRef(false);
  const pendingRemoteFilesStateRef = useRef<FileHistoryState | null>(null);
  
  // Create stable references for current session data
  const sessionIncluded = useMemo(() => currentSession?.includedFiles || [], [currentSession?.includedFiles]);
  const sessionExcluded = useMemo(() => currentSession?.forceExcludedFiles || [], [currentSession?.forceExcludedFiles]);

  // Memoized sets for fast lookups in toggles
  const includedSet = useMemo(() => new Set(sessionIncluded), [sessionIncluded]);
  const excludedSet = useMemo(() => new Set(sessionExcluded), [sessionExcluded]);

  // Load device ID
  useEffect(() => {
    getDeviceIdAction().then(setDeviceId);
  }, []);

  // Update canUndo/canRedo
  useEffect(() => {
    setCanUndo(historyState.currentIndex > 0);
    setCanRedo(historyState.currentIndex < historyState.entries.length - 1);
  }, [historyState.currentIndex, historyState.entries.length]);

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
    const externalPaths = sessionIncluded.filter((path) => isLikelyAbsolutePath(path));

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
    isUndoRedoInProgress.current = false;

    setHistoryState({
      entries: [],
      currentIndex: -1,
      version: 1,
      checksum: '',
    });

    if (!sessionId) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // NEW API returns HistoryState directly (transformation handled in getHistoryStateAction)
        const state = await getHistoryStateAction(sessionId, 'files') as any as FileHistoryState;

        if (cancelled) {
          return;
        }

        if (state && state.entries && state.entries.length > 0) {
          setHistoryState(state);
        }
      } catch (err) {
        console.warn('Failed to load file selection history for session', sessionId, err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentSession?.id]);

  // NOTE: Legacy sync effects removed - periodic sync timer handles all persistence

  // Track active modifications
  const handleFileSelectionStart = useCallback(() => {
    isActivelyModifyingRef.current = true;
  }, []);

  const handleFileSelectionEnd = useCallback(() => {
    isActivelyModifyingRef.current = false;

    if (pendingRemoteFilesStateRef.current) {
      applyPendingRemoteState();
    }
  }, []);

  // Apply remote state helper
  const applyRemoteState = useCallback((state: FileHistoryState) => {
    remoteHistoryApplyingRef.current = true;

    try {
      setHistoryState(state);

      const currentEntry = state.entries[state.currentIndex];
      if (currentEntry) {
        updateCurrentSessionFields({
          includedFiles: currentEntry.includedFiles,
          forceExcludedFiles: currentEntry.forceExcludedFiles,
        });
      }
    } finally {
      remoteHistoryApplyingRef.current = false;
    }
  }, [updateCurrentSessionFields]);

  const applyPendingRemoteState = useCallback(() => {
    if (!pendingRemoteFilesStateRef.current) return;

    const pending = pendingRemoteFilesStateRef.current;
    pendingRemoteFilesStateRef.current = null;

    applyRemoteState(pending);
  }, [applyRemoteState]);

  // Debounced commit (500ms)
  const commitFileSelection = useCallback(
    debounce(async (includedFiles: string[], forceExcludedFiles: string[]) => {
      const sessionId = currentSession?.id;
      if (!sessionId) return;
      if (isNavigatingHistoryRef.current || remoteHistoryApplyingRef.current) return;

      const lastEntry = historyState.entries[historyState.currentIndex];
      const isSameSelection = (() => {
        if (!lastEntry) return false;
        const lastIncluded = [...lastEntry.includedFiles].sort();
        const lastExcluded = [...lastEntry.forceExcludedFiles].sort();
        const currentIncluded = [...includedFiles].sort();
        const currentExcluded = [...forceExcludedFiles].sort();
        return JSON.stringify(lastIncluded) === JSON.stringify(currentIncluded)
          && JSON.stringify(lastExcluded) === JSON.stringify(currentExcluded);
      })();

      if (isSameSelection) return;

      const normalizedIncluded = normalizeFileList(includedFiles);
      const normalizedExcluded = normalizeFileList(forceExcludedFiles);

      const newEntry: FileHistoryEntry = {
        includedFiles: normalizedIncluded,
        forceExcludedFiles: normalizedExcluded,
        timestampMs: Date.now(),
        deviceId: deviceId || 'unknown',
        opType: 'user-edit',
        sequenceNumber: nextSequenceNumber(historyState.entries, deviceId || undefined),
      };

      const trimmedEntries = historyState.entries.slice(0, historyState.currentIndex + 1);
      const newEntries = [...trimmedEntries, newEntry].slice(-FILE_HISTORY_MAX_ENTRIES);

      const newState: FileHistoryState = {
        entries: newEntries,
        currentIndex: newEntries.length - 1,
        version: historyState.version,
        checksum: historyState.checksum,
      };

      try {
        setHistoryState(newState);

        // Convert FileHistoryState to API format - arrays become JSON strings
        const apiState = {
          entries: newState.entries.map(e => ({
            includedFiles: JSON.stringify(e.includedFiles),
            forceExcludedFiles: JSON.stringify(e.forceExcludedFiles),
            timestampMs: e.timestampMs,
            deviceId: e.deviceId,
            opType: e.opType,
            sequenceNumber: e.sequenceNumber,
            version: newState.version,
          })),
          currentIndex: newState.currentIndex,
          version: newState.version,
          checksum: newState.checksum,
        };

        const updatedApiState = await syncHistoryStateAction(
          sessionId,
          'files',
          apiState as any,
          historyState.version
        );

        // Convert back to FileHistoryState - JSON strings become arrays
        const updatedState: FileHistoryState = {
          entries: updatedApiState.entries.map((e: any) => ({
            includedFiles: safeParseJsonArray(e.includedFiles),
            forceExcludedFiles: safeParseJsonArray(e.forceExcludedFiles),
            timestampMs: e.timestampMs,
            deviceId: e.deviceId,
            opType: e.opType,
            sequenceNumber: e.sequenceNumber,
          })),
          currentIndex: updatedApiState.currentIndex,
          version: updatedApiState.version,
          checksum: updatedApiState.checksum,
        };

        setHistoryState(updatedState);
      } catch (err) {
        console.error('File selection commit failed:', err);
      }
    }, 500),
    [currentSession?.id, deviceId, historyState, updateCurrentSessionFields]
  );

  // Trigger commit when session files change
  useEffect(() => {
    if (!isNavigatingHistoryRef.current && !remoteHistoryApplyingRef.current) {
      commitFileSelection(sessionIncluded, sessionExcluded);
    }
  }, [sessionIncluded, sessionExcluded, commitFileSelection]);

  // Toggle file inclusion
  const toggleFileSelection = useCallback((path: string) => {
    if (!currentSession) return;

    const isCurrentlyIncluded = includedSet.has(path);
    const newIncluded = !isCurrentlyIncluded;

    // Derive next arrays optimistically
    let nextIncluded: string[];
    let nextExcluded: string[];

    if (newIncluded) {
      // Add to included, remove from excluded
      nextIncluded = isCurrentlyIncluded ? sessionIncluded : [...sessionIncluded, path];
      nextExcluded = excludedSet.has(path) ? sessionExcluded.filter(p => p !== path) : sessionExcluded;
    } else {
      // Remove from included
      nextIncluded = sessionIncluded.filter(p => p !== path);
      nextExcluded = sessionExcluded;
    }

    // Optimistic update first
    updateCurrentSessionFields({
      includedFiles: nextIncluded,
      forceExcludedFiles: nextExcluded
    });

  }, [currentSession, includedSet, excludedSet, sessionIncluded, sessionExcluded, updateCurrentSessionFields]);

  // Toggle file exclusion
  const toggleFileExclusion = useCallback((path: string) => {
    if (!currentSession) return;

    const isCurrentlyExcluded = excludedSet.has(path);
    const newExcluded = !isCurrentlyExcluded;

    // Derive next arrays optimistically
    let nextIncluded: string[];
    let nextExcluded: string[];

    if (newExcluded) {
      // Add to excluded, remove from included
      nextExcluded = isCurrentlyExcluded ? sessionExcluded : [...sessionExcluded, path];
      nextIncluded = includedSet.has(path) ? sessionIncluded.filter(p => p !== path) : sessionIncluded;
    } else {
      // Remove from excluded
      nextExcluded = sessionExcluded.filter(p => p !== path);
      nextIncluded = sessionIncluded;
    }

    // Optimistic update first
    updateCurrentSessionFields({
      includedFiles: nextIncluded,
      forceExcludedFiles: nextExcluded
    });

  }, [currentSession, includedSet, excludedSet, sessionIncluded, sessionExcluded, updateCurrentSessionFields]);

  // Undo/Redo for file selections
  const handleUndo = useCallback(async () => {
    const sessionId = currentSession?.id;
    if (!canUndo || !sessionId) return;

    isNavigatingHistoryRef.current = true;
    isUndoRedoInProgress.current = true;

    try {
      const newIndex = historyState.currentIndex - 1;
      const newState: FileHistoryState = {
        ...historyState,
        currentIndex: newIndex,
      };

      // Convert to API format - arrays become JSON strings
        const apiState = {
          entries: newState.entries.map(e => ({
            includedFiles: JSON.stringify(e.includedFiles),
            forceExcludedFiles: JSON.stringify(e.forceExcludedFiles),
            timestampMs: e.timestampMs,
            deviceId: e.deviceId,
            opType: e.opType,
            sequenceNumber: e.sequenceNumber,
            version: newState.version,
          })),
        currentIndex: newState.currentIndex,
        version: newState.version,
        checksum: newState.checksum,
      };

      const updatedApiState = await syncHistoryStateAction(
        sessionId,
        'files',
        apiState as any,
        historyState.version
      );

      // Convert back to FileHistoryState - JSON strings become arrays
      const updatedState: FileHistoryState = {
        entries: updatedApiState.entries.map((e: any) => ({
          includedFiles: safeParseJsonArray(e.includedFiles),
          forceExcludedFiles: safeParseJsonArray(e.forceExcludedFiles),
          timestampMs: e.timestampMs,
          deviceId: e.deviceId,
          opType: e.opType,
          sequenceNumber: e.sequenceNumber,
        })),
        currentIndex: updatedApiState.currentIndex,
        version: updatedApiState.version,
        checksum: updatedApiState.checksum,
      };

      setHistoryState(updatedState);

      const entry = updatedState.entries[newIndex];
      if (entry) {
        updateCurrentSessionFields({
          includedFiles: entry.includedFiles,
          forceExcludedFiles: entry.forceExcludedFiles,
        });
      }
    } catch (err) {
      console.error('File undo failed:', err);
    } finally {
      isNavigatingHistoryRef.current = false;
      isUndoRedoInProgress.current = false;
    }
  }, [canUndo, currentSession?.id, historyState, updateCurrentSessionFields]);

  const handleRedo = useCallback(async () => {
    const sessionId = currentSession?.id;
    if (!canRedo || !sessionId) return;

    isNavigatingHistoryRef.current = true;
    isUndoRedoInProgress.current = true;

    try {
      const newIndex = historyState.currentIndex + 1;
      const newState: FileHistoryState = {
        ...historyState,
        currentIndex: newIndex,
      };

      // Convert to API format - arrays become JSON strings
        const apiState = {
          entries: newState.entries.map(e => ({
            includedFiles: JSON.stringify(e.includedFiles),
            forceExcludedFiles: JSON.stringify(e.forceExcludedFiles),
            timestampMs: e.timestampMs,
            deviceId: e.deviceId,
            opType: e.opType,
            sequenceNumber: e.sequenceNumber,
            version: newState.version,
          })),
        currentIndex: newState.currentIndex,
        version: newState.version,
        checksum: newState.checksum,
      };

      const updatedApiState = await syncHistoryStateAction(
        sessionId,
        'files',
        apiState as any,
        historyState.version
      );

      // Convert back to FileHistoryState - JSON strings become arrays
      const updatedState: FileHistoryState = {
        entries: updatedApiState.entries.map((e: any) => ({
          includedFiles: safeParseJsonArray(e.includedFiles),
          forceExcludedFiles: safeParseJsonArray(e.forceExcludedFiles),
          timestampMs: e.timestampMs,
          deviceId: e.deviceId,
          opType: e.opType,
          sequenceNumber: e.sequenceNumber,
        })),
        currentIndex: updatedApiState.currentIndex,
        version: updatedApiState.version,
        checksum: updatedApiState.checksum,
      };

      setHistoryState(updatedState);

      const entry = updatedState.entries[newIndex];
      if (entry) {
        updateCurrentSessionFields({
          includedFiles: entry.includedFiles,
          forceExcludedFiles: entry.forceExcludedFiles,
        });
      }
    } catch (err) {
      console.error('File redo failed:', err);
    } finally {
      isNavigatingHistoryRef.current = false;
      isUndoRedoInProgress.current = false;
    }
  }, [canRedo, currentSession?.id, historyState, updateCurrentSessionFields]);

  // Legacy undo/redo (keeping for backward compatibility)
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
    const pathsToInclude = filteredPaths.filter(path => !includedSet.has(path));

    if (pathsToInclude.length === 0) return;

    // Compute next arrays optimistically
    const nextIncluded = [...sessionIncluded, ...pathsToInclude];
    const pathsToUnexclude = filteredPaths.filter(path => excludedSet.has(path));
    const nextExcluded = pathsToUnexclude.length > 0
      ? sessionExcluded.filter(path => !filteredPaths.includes(path))
      : sessionExcluded;

    // Optimistic update first
    updateCurrentSessionFields({
      includedFiles: nextIncluded,
      forceExcludedFiles: nextExcluded
    });

  }, [currentSession, filteredAndSortedFiles, includedSet, excludedSet, sessionIncluded, sessionExcluded, updateCurrentSessionFields]);

  // Deselect filtered files only
  const deselectFiltered = useCallback(() => {
    if (!currentSession) return;

    const filteredPaths = filteredAndSortedFiles.map(f => f.path);
    const pathsToRemove = filteredPaths.filter(path => includedSet.has(path));

    if (pathsToRemove.length === 0) return;

    // Compute next arrays optimistically
    const nextIncluded = sessionIncluded.filter(path => !filteredPaths.includes(path));

    // Optimistic update first
    updateCurrentSessionFields({
      includedFiles: nextIncluded
    });

  }, [currentSession, filteredAndSortedFiles, includedSet, sessionIncluded, updateCurrentSessionFields]);

  // Exclude filtered files only
  const excludeFiltered = useCallback(() => {
    if (!currentSession) return;

    const filteredPaths = filteredAndSortedFiles.map(f => f.path);
    const pathsToExclude = filteredPaths.filter(path => !excludedSet.has(path));

    if (pathsToExclude.length === 0) return;

    // Compute next arrays optimistically
    const nextExcluded = [...sessionExcluded, ...pathsToExclude];
    const pathsToUninclude = filteredPaths.filter(path => includedSet.has(path));
    const nextIncluded = pathsToUninclude.length > 0
      ? sessionIncluded.filter(path => !filteredPaths.includes(path))
      : sessionIncluded;

    // Optimistic update first
    updateCurrentSessionFields({
      includedFiles: nextIncluded,
      forceExcludedFiles: nextExcluded
    });

  }, [currentSession, filteredAndSortedFiles, includedSet, excludedSet, sessionIncluded, sessionExcluded, updateCurrentSessionFields]);

  // Unexclude filtered files only
  const unexcludeFiltered = useCallback(() => {
    if (!currentSession) return;

    const filteredPaths = filteredAndSortedFiles.map(f => f.path);
    const pathsToUnexclude = filteredPaths.filter(path => excludedSet.has(path));

    if (pathsToUnexclude.length === 0) return;

    // Compute next arrays optimistically
    const nextExcluded = sessionExcluded.filter(path => !filteredPaths.includes(path));

    // Optimistic update first
    updateCurrentSessionFields({
      forceExcludedFiles: nextExcluded
    });

  }, [currentSession, filteredAndSortedFiles, excludedSet, sessionExcluded, updateCurrentSessionFields]);

  // Listen for remote updates
  useEffect(() => {
    const sessionId = currentSession?.id;
    if (!sessionId) return;

    const handleHistoryStateChanged = (event: CustomEvent) => {
      const { sessionId: eventSessionId, kind, state } = event.detail;

      if (eventSessionId !== sessionId || kind !== 'files') return;
      if (remoteHistoryApplyingRef.current) return;

      if (isActivelyModifyingRef.current) {
        pendingRemoteFilesStateRef.current = state;
        return;
      }

      applyRemoteState(state);
    };

    window.addEventListener('history-state-changed', handleHistoryStateChanged as EventListener);

    return () => {
      window.removeEventListener('history-state-changed', handleHistoryStateChanged as EventListener);
    };
  }, [currentSession?.id, applyRemoteState]);

  // Refresh history state on relay replay gaps
  useEffect(() => {
    const sessionId = currentSession?.id;
    if (!sessionId) return;

    let cancelled = false;

    const handleReplayGap = () => {
      if (remoteHistoryApplyingRef.current) return;

      (async () => {
        try {
          const state = await getHistoryStateAction(sessionId, 'files') as any as FileHistoryState;
          if (cancelled) return;

          if (isActivelyModifyingRef.current) {
            pendingRemoteFilesStateRef.current = state;
            return;
          }

          applyRemoteState(state);
        } catch (err) {
          console.warn('Failed to refresh file history after replay gap', err);
        }
      })();
    };

    window.addEventListener('relay-replay-gap', handleReplayGap as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener('relay-replay-gap', handleReplayGap as EventListener);
    };
  }, [currentSession?.id, applyRemoteState]);

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

  // Listen for authoritative backend file updates
  useEffect(() => {
    const sessionId = currentSession?.id;
    if (!sessionId) return;

    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<{
          sessionId: string;
          includedFiles: string[] | string;
          forceExcludedFiles: string[] | string;
        }>("session-files-updated", (event) => {
          const p = event.payload;

          if (p.sessionId !== sessionId) return;

          // Defensively parse arrays in case they arrive as stringified JSON
          const included = safeParseJsonArray(p.includedFiles);
          const excluded = safeParseJsonArray(p.forceExcludedFiles);

          updateCurrentSessionFields({
            includedFiles: included,
            forceExcludedFiles: excluded,
          });
        });
      } catch (err) {
        console.error("Failed to setup session-files-updated listener:", err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [currentSession?.id, updateCurrentSessionFields]);

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
    // New HistoryState handlers
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    handleFileSelectionStart,
    handleFileSelectionEnd,
    // Legacy undo/redo for backward compatibility
    undo,
    redo,
    selectFiltered,
    deselectFiltered,
    excludeFiltered,
    unexcludeFiltered,
  };
}

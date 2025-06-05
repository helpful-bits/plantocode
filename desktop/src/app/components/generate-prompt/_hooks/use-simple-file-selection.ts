"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { listProjectFilesAction } from "@/actions/file-system/list-project-files.action";
import { WorkflowTracker } from "@/utils/workflow-utils";

interface SimpleFileInfo {
  path: string;
  size?: number;
  modifiedAt?: number;
  createdAt?: number;
  included: boolean;
  excluded: boolean;
}

/**
 * EXTREMELY SIMPLE file selection hook
 * No caching, no complex state management, no transformations
 * Just files, selection state, and direct database saves
 */
export function useSimpleFileSelection(projectDirectory?: string) {
  const { currentSession, activeSessionId } = useSessionStateContext();
  const { updateCurrentSessionFields } = useSessionActionsContext();
  
  const [files, setFiles] = useState<SimpleFileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "selected">("all");
  const [findingFiles, setFindingFiles] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "size" | "modified">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  
  // Track active workflow to handle completion
  const activeWorkflowTracker = useRef<WorkflowTracker | null>(null);
  
  // History for undo/redo
  const [history, setHistory] = useState<{ includedFiles: string[], forceExcludedFiles: string[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Create stable references for current session data
  const sessionIncluded = useMemo(() => currentSession?.includedFiles || [], [currentSession?.includedFiles]);
  const sessionExcluded = useMemo(() => currentSession?.forceExcludedFiles || [], [currentSession?.forceExcludedFiles]);

  // Load files from file system 
  const loadFiles = useCallback(async (preserveSelections = false) => {
    if (!projectDirectory) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await listProjectFilesAction({
        directory: projectDirectory,
        pattern: "**/*",
        includeStats: true,
        exclude: [],
      });

      if (!result.isSuccess || !result.data) {
        throw new Error(result.message || "Failed to load files");
      }

      // Create file list with or without current session state
      let fileList: SimpleFileInfo[];
      
      if (preserveSelections) {
        const includedSet = new Set(sessionIncluded);
        const excludedSet = new Set(sessionExcluded);

        fileList = result.data.map(file => ({
          path: file.path,
          size: file.size,
          modifiedAt: file.modifiedAt,
          createdAt: file.createdAt,
          included: includedSet.has(file.path),
          excluded: excludedSet.has(file.path),
        }));
      } else {
        fileList = result.data.map(file => ({
          path: file.path,
          size: file.size,
          modifiedAt: file.modifiedAt,
          createdAt: file.createdAt,
          included: false,
          excluded: false,
        }));
      }

      setFiles(fileList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectDirectory, sessionIncluded, sessionExcluded]);

  // Separate refresh function that preserves selections
  const refreshFiles = useCallback(() => {
    loadFiles(true);
  }, [loadFiles]);

  // ONLY load files when project directory changes (without preserving selections)
  useEffect(() => {
    loadFiles(false);
  }, [projectDirectory]);

  // Sync file selection state when session data changes (without reloading files)
  useEffect(() => {
    if (files.length === 0) return; // Don't sync if no files loaded yet
    
    const includedSet = new Set(sessionIncluded);
    const excludedSet = new Set(sessionExcluded);
    
    setFiles(prevFiles => 
      prevFiles.map(file => ({
        ...file,
        included: includedSet.has(file.path),
        excluded: excludedSet.has(file.path),
      }))
    );
  }, [sessionIncluded, sessionExcluded, files.length]);

  // Save to history before making changes
  const saveToHistory = useCallback(() => {
    const currentState = {
      includedFiles: currentSession?.includedFiles || [],
      forceExcludedFiles: currentSession?.forceExcludedFiles || []
    };
    
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(currentState);
      return newHistory.slice(-50); // Keep last 50 states
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [currentSession, historyIndex]);

  // Toggle file inclusion
  const toggleFileSelection = useCallback((path: string) => {
    saveToHistory();
    
    setFiles(prevFiles => {
      const updatedFiles = prevFiles.map(file => 
        file.path === path 
          ? { ...file, included: !file.included, excluded: file.excluded && !file.included }
          : file
      );
      
      const newIncluded = updatedFiles
        .filter(file => file.included && !file.excluded)
        .map(file => file.path);

      updateCurrentSessionFields({ includedFiles: newIncluded });
      
      return updatedFiles;
    });
  }, [updateCurrentSessionFields, saveToHistory]);

  // Toggle file exclusion
  const toggleFileExclusion = useCallback((path: string) => {
    saveToHistory();
    
    setFiles(prevFiles => {
      const updatedFiles = prevFiles.map(file => 
        file.path === path 
          ? { ...file, excluded: !file.excluded, included: file.included && file.excluded }
          : file
      );

      const newExcluded = updatedFiles
        .filter(file => file.excluded)
        .map(file => file.path);

      const newIncluded = updatedFiles
        .filter(file => file.included && !file.excluded)
        .map(file => file.path);

      updateCurrentSessionFields({ 
        forceExcludedFiles: newExcluded,
        includedFiles: newIncluded
      });
      
      return updatedFiles;
    });
  }, [updateCurrentSessionFields, saveToHistory]);

  // Undo functionality
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      updateCurrentSessionFields({
        includedFiles: prevState.includedFiles,
        forceExcludedFiles: prevState.forceExcludedFiles
      });
    }
  }, [history, historyIndex, updateCurrentSessionFields]);

  // Redo functionality
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      updateCurrentSessionFields({
        includedFiles: nextState.includedFiles,
        forceExcludedFiles: nextState.forceExcludedFiles
      });
    }
  }, [history, historyIndex, updateCurrentSessionFields]);

  // Sort function
  const sortFiles = useCallback((filesToSort: SimpleFileInfo[]) => {
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
    // First filter
    const filtered = files.filter(file => {
      // Search filter
      const matchesSearch = file.path.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filter mode filter
      const matchesFilter = filterMode === "all" || (filterMode === "selected" && file.included && !file.excluded);
      
      return matchesSearch && matchesFilter;
    });
    
    // Then sort
    return sortFiles(filtered);
  }, [files, searchTerm, filterMode, sortFiles]);

  // Count from all files, not just filtered
  const includedCount = files.filter(f => f.included && !f.excluded).length;

  // Clean up workflow tracker on unmount
  useEffect(() => {
    return () => {
      if (activeWorkflowTracker.current) {
        activeWorkflowTracker.current.destroy();
        activeWorkflowTracker.current = null;
      }
    };
  }, []);

  // Clean up workflow tracker when session changes
  useEffect(() => {
    if (activeWorkflowTracker.current) {
      activeWorkflowTracker.current.destroy();
      activeWorkflowTracker.current = null;
      setFindingFiles(false);
    }
  }, [activeSessionId]);

  // Apply workflow results to file selection
  const applyWorkflowResultsToSession = useCallback((paths: string[], source: string) => {
    if (paths && paths.length > 0) {
      // Save current state to history before applying results
      saveToHistory();
      
      // Update session with found files
      const newIncludedFiles = [...new Set([...sessionIncluded, ...paths])];
      updateCurrentSessionFields({ includedFiles: newIncludedFiles });
      
      console.log(`Applied ${paths.length} files from ${source}`);
    }
  }, [sessionIncluded, updateCurrentSessionFields, saveToHistory]);

  // Find function - triggers file finder workflow with completion handling
  const triggerFind = useCallback(async () => {
    if (!activeSessionId || !projectDirectory || !currentSession?.taskDescription) {
      console.warn("Missing required data for file finder workflow");
      return;
    }

    // Clean up any existing workflow tracker
    if (activeWorkflowTracker.current) {
      activeWorkflowTracker.current.destroy();
      activeWorkflowTracker.current = null;
    }

    setFindingFiles(true);
    setError(null);

    try {
      // Start workflow using WorkflowTracker for full lifecycle management
      const tracker = await WorkflowTracker.startWorkflow(
        activeSessionId,
        currentSession.taskDescription,
        projectDirectory,
        currentSession.forceExcludedFiles || [],
        { timeoutMs: 300000 } // 5 minutes
      );

      activeWorkflowTracker.current = tracker;

      // Listen for workflow completion
      tracker.onComplete(async (results) => {
        try {
          applyWorkflowResultsToSession(results.finalPaths || [], "workflow completion");
        } catch (error) {
          console.error("Failed to apply workflow completion results:", error);
          setError("Failed to apply workflow results");
        } finally {
          setFindingFiles(false);
          activeWorkflowTracker.current = null;
        }
      });

      // Listen for workflow errors
      tracker.onError((error) => {
        console.error("Workflow error:", error);
        setError(`Workflow failed: ${error.message}`);
        setFindingFiles(false);
        activeWorkflowTracker.current = null;
      });

      console.log("File finder workflow started:", tracker.getWorkflowId());
    } catch (error) {
      console.error("Error starting file finder workflow:", error);
      setError(error instanceof Error ? error.message : "Failed to start workflow");
      setFindingFiles(false);
    }
  }, [activeSessionId, projectDirectory, currentSession?.taskDescription, currentSession?.forceExcludedFiles, sessionIncluded, updateCurrentSessionFields, saveToHistory]);

  // Select filtered files only
  const selectFiltered = useCallback(() => {
    saveToHistory();
    
    setFiles(prevFiles => {
      const filteredPaths = new Set(filteredAndSortedFiles.map(f => f.path));
      
      const updatedFiles = prevFiles.map(file => {
        if (filteredPaths.has(file.path)) {
          return { ...file, included: true, excluded: false };
        }
        return file;
      });
      
      const newIncluded = updatedFiles
        .filter(file => file.included && !file.excluded)
        .map(file => file.path);
      
      updateCurrentSessionFields({ includedFiles: newIncluded });
      
      return updatedFiles;
    });
  }, [saveToHistory, updateCurrentSessionFields, filteredAndSortedFiles]);

  // Deselect filtered files only
  const deselectFiltered = useCallback(() => {
    saveToHistory();
    
    setFiles(prevFiles => {
      const filteredPaths = new Set(filteredAndSortedFiles.map(f => f.path));
      
      const updatedFiles = prevFiles.map(file => {
        if (filteredPaths.has(file.path)) {
          return { ...file, included: false, excluded: false };
        }
        return file;
      });
      
      const newIncluded = updatedFiles
        .filter(file => file.included && !file.excluded)
        .map(file => file.path);
      
      updateCurrentSessionFields({ includedFiles: newIncluded });
      
      return updatedFiles;
    });
  }, [saveToHistory, updateCurrentSessionFields, filteredAndSortedFiles]);

  return {
    files: filteredAndSortedFiles,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    filterMode,
    setFilterMode,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    toggleFileSelection,
    toggleFileExclusion,
    refreshFiles,
    includedCount,
    totalCount: files.length,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    triggerFind,
    findingFiles,
    selectFiltered,
    deselectFiltered,
  };
}
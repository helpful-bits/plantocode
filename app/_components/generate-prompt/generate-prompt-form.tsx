"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { readDirectoryAction, readExternalFileAction, invalidateDirectoryCache } from "@/actions/read-directory-actions"; // Keep read-directory-actions import
import { findRelevantFilesAction } from "@/actions/path-finder-actions"; // Import the enhanced action
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { estimateTokens } from "@/lib/token-estimator"; // Keep token-estimator import
import { getDiffPrompt } from "@/prompts/diff-prompt"; // Import only diff prompt
import ProjectDirectorySelector from "./_components/project-directory-selector"; // Keep ProjectDirectorySelector import
import { useProject } from "@/lib/contexts/project-context"; // Keep project-context import
import { useDatabase } from "@/lib/contexts/database-context";
import { normalizePath } from "@/lib/path-utils"; // Import from the correct file
import FileBrowser from "./file-browser"; // Keep FileBrowser import
import RegexInput from "./_components/regex-input"; // Keep RegexInput import
import PastePaths from "./paste-paths";
import path from "path";
import TaskDescriptionArea, { TaskDescriptionHandle } from "./_components/task-description"; // Keep TaskDescriptionHandle import
import VoiceTranscription from "./_components/voice-transcription"; // Keep VoiceTranscription import
import { Session } from "@/types";
import { Input } from "@/components/ui/input";
import { GeminiProcessor } from '@/app/_components/gemini-processor/gemini-processor'; // Import the new component
import { Loader2, Search, Wand2, ToggleLeft, ToggleRight } from "lucide-react"; // Add necessary icons
import { cn } from "@/lib/utils";
import { invalidateFileCache } from '@/lib/git-utils';
import { Button } from "@/components/ui/button";
import { generateDirectoryTree } from "@/lib/directory-tree"; // Import directory tree generator
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";

// Fix the lazy imports with proper dynamic import syntax
const SessionManager = React.lazy(() => import("./_components/session-manager"));
const SessionGuard = React.lazy(() => import("./_components/session-guard"));
const FormStateManager = React.lazy(() => import("./_components/form-state-manager"));
const PatternDescriptionInput = React.lazy(() => import("./_components/pattern-description-input")); // Keep PatternDescriptionInput import

interface FileInfo {
  path: string;
  size: number;
  included: boolean;
  forceExcluded: boolean;
}

type FilesMap = { [path: string]: FileInfo };

// Helper function to determine if a file should be included by default
const shouldIncludeByDefault = (filePath: string): boolean => {
  // Since we're using git and respecting .gitignore, we only need to exclude
  // a few specific patterns for files that might be in the repo but usually shouldn't be included
  const lowercasePath = filePath.toLowerCase();
  
  // Skip log files, lock files, and large generated files
  if (
    lowercasePath.endsWith('.log') ||
    lowercasePath.endsWith('.lock') ||
    lowercasePath.endsWith('.min.js') ||
    lowercasePath.endsWith('.min.css') ||
    lowercasePath.endsWith('.map') ||
    lowercasePath.includes('dist/') || 
    lowercasePath.includes('build/') ||
    lowercasePath.includes('/vendor/') ||
    lowercasePath.includes('package-lock.json') ||
    lowercasePath.includes('yarn.lock') ||
    lowercasePath.includes('pnpm-lock.yaml')
  ) {
    return false;
  }
  
  // Include almost everything else
  return true;
};

export default function GeneratePromptForm() {
  const { projectDirectory, setProjectDirectory } = useProject();
  const { repository } = useDatabase(); // Access the repository from context
  const [taskDescription, setTaskDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pastedPaths, setPastedPaths] = useState("");
  const [patternDescription, setPatternDescription] = useState("");
  const [titleRegex, setTitleRegex] = useState("");
  const [contentRegex, setContentRegex] = useState("");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [regexGenerationError, setRegexGenerationError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingRegex, setIsGeneratingRegex] = useState(false);
  const [allFilesMap, setAllFilesMap] = useState<FilesMap>({}); // All files from git ls-files, keyed by path
  const [fileContentsMap, setFileContentsMap] = useState<{ [key: string]: string }>({}); // Contents of files
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [isRegexActive, setIsRegexActive] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false); // Keep debug mode state
  const [pathDebugInfo, setPathDebugInfo] = useState<{ original: string, normalized: string }[]>([]);
  const saveTaskDebounceTimer = React.useRef<NodeJS.Timeout | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null); // State for auto-save errors
  const taskDescriptionRef = useRef<TaskDescriptionHandle>(null); // Keep ref for task description
  const [isFormSaving, setIsFormSaving] = useState(false); // State to track if FormStateManager is saving
  const [isRefreshingFiles, setIsRefreshingFiles] = useState(false); // Add state for refresh operation
  const [isFindingFiles, setIsFindingFiles] = useState(false); // State for Path Finder action
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnly] = useState<boolean>(false);
  const [contextType, setContextType] = useState<string>("files"); // 'files' or 'vector'
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("markdown");
  // URL handling
  const router = useRouter(); // Keep useRouter
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Ref to control initial loading and prevent loops
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initializationRef = useRef<{ projectInitialized: boolean; }>({ projectInitialized: false });

  // Preference keys for saving user preferences
  const CONTEXT_TYPE_KEY = "generate-prompt-context-type";
  const OUTPUT_FORMAT_KEY = "generate-prompt-output-format";
  const SEARCH_SELECTED_FILES_ONLY_KEY = "search-selected-files-only";

  const { includedPaths, excludedPaths } = useMemo(() => {
    const included = Object.values(allFilesMap)
      .filter(f => f.included && !f.forceExcluded)
      .map(f => f.path);
    
    const excluded = Object.values(allFilesMap)
      .filter(f => f.forceExcluded)
      .map(f => f.path);
    
    return { includedPaths: included, excludedPaths: excluded };
  }, [allFilesMap]);

  // Define the handleInteraction function to mark form interactions
  const handleInteraction = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // Function to estimate token count
  const updateTokenCount = useCallback(async (text: string) => {
    const count = await estimateTokens(text);
    // Only update if count is different to avoid re-renders
    setTokenCount(prevCount => prevCount !== count ? count : prevCount);
  }, []);

  // --- URL Sync Effect ---
  useEffect(() => {
    const urlProjectDirRaw = searchParams.get('projectDir');
    const urlProjectDir = urlProjectDirRaw ? normalizePath(decodeURIComponent(urlProjectDirRaw)) : null;
    const currentProjectDir = projectDirectory || "";

    // On mount, if URL has a projectDir different from current context, update context
    if (urlProjectDir && normalizePath(urlProjectDir) !== normalizePath(currentProjectDir) && !initializationRef.current.projectInitialized) {
      console.log(`[Form URL] Setting project directory from URL: ${urlProjectDir}`);
      setProjectDirectory(urlProjectDir); // Update context with normalized path
    }
    initializationRef.current.projectInitialized = true; // Mark project as initialized after URL check
  }, [searchParams, setProjectDirectory]); // Removed projectDirectory dependency to run only once

  // Update URL when projectDirectory changes (and is valid)
  useEffect(() => {
    const currentUrlProjectDir = searchParams.get('projectDir');
    const encodedProjectDir = projectDirectory ? encodeURIComponent(projectDirectory) : null;

    // Only update URL if the project directory has changed and is not empty
    // Use normalizePath for comparison to avoid issues with trailing slashes etc.
    if (projectDirectory && (!currentUrlProjectDir || normalizePath(decodeURIComponent(currentUrlProjectDir)) !== normalizePath(projectDirectory))) {
      console.log(`[Form URL] Updating URL with project directory: ${projectDirectory}`);
      const newUrl = `${pathname}${encodedProjectDir ? `?projectDir=${encodeURIComponent(projectDirectory)}` : ''}`; // Use projectDirectory directly
      router.replace(newUrl, { scroll: false }); // Use replace to avoid history spam
    }
  }, [projectDirectory, pathname, router, searchParams]);

  // Function to save active session ID
  const handleSetActiveSessionId = useCallback(async (sessionId: string | null) => { // Make async
    console.log(`[Form] Setting active session ID internally: ${sessionId}`);
    setActiveSessionId(sessionId); // Set the active session ID state
    setSessionInitialized(!!sessionId);
    if (!sessionId) {
      setHasUnsavedChanges(false); // Reset unsaved changes flag when session is cleared
    }
    setSessionSaveError(null); // Clear save error when session changes
    
    // Also save to database for the current project directory
    if (projectDirectory && repository) {
      try {
        console.log(`[Form] Persisting active session ID for project ${projectDirectory}: ${sessionId}`);
        await repository.setActiveSession(projectDirectory, sessionId);
      } catch (error) {
        console.error('Failed to persist active session ID to database:', error);
        // Don't interrupt the user flow, but log the error
      }
    }
  }, [projectDirectory, repository]); // Add projectDirectory and repository as dependencies

  // Load files function with debounce reference
  const loadFilesRef = useRef<{
    lastDirectory: string | null;
    lastLoadTime: number;
    isLoading: boolean;
  }>({
    lastDirectory: null,
    lastLoadTime: 0,
    isLoading: false
  });

  // Minimum time between automatic file loads (ms)
  const MIN_LOAD_INTERVAL = 60000; // 1 minute
  
  // Helper function to normalize file paths consistently
  const normalizeFilePath = useCallback((filePath: string): string => {
    try {
      // Use the shared normalization utility and handle any errors
      const normalized = normalizePath(filePath);
      return normalized;
    } catch (error) {
      console.warn(`Failed to normalize path: ${filePath}`, error);
      // Return the original path if normalization fails
      return filePath;
    }
  }, []);
  
  // Selection state tracking for diagnostic purposes
  const trackSelectionChanges = useCallback((
    operation: string,
    oldState: FilesMap | null,
    newState: FilesMap
  ) => {
    // Skip if no previous state
    if (!oldState) return;
    
    // Count changes
    let addedFiles = 0;
    let removedFiles = 0;
    let includedChanges = 0;
    let excludedChanges = 0;
    
    // Check for files that exist in new but not in old
    Object.keys(newState).forEach(path => {
      if (!oldState[path]) {
        addedFiles++;
      }
    });
    
    // Check for files that exist in old but not in new
    Object.keys(oldState).forEach(path => {
      if (!newState[path]) {
        removedFiles++;
      }
    });
    
    // Check for selection changes on files that exist in both
    Object.keys(newState).forEach(path => {
      if (oldState[path]) {
        const oldIncluded = !!oldState[path].included;
        const newIncluded = !!newState[path].included;
        const oldExcluded = !!oldState[path].forceExcluded;
        const newExcluded = !!newState[path].forceExcluded;
        
        if (oldIncluded !== newIncluded) {
          includedChanges++;
        }
        
        if (oldExcluded !== newExcluded) {
          excludedChanges++;
        }
      }
    });
    
    // Only log if there are actual changes
    if (addedFiles > 0 || removedFiles > 0 || includedChanges > 0 || excludedChanges > 0) {
      console.log(`[Track] ${operation}: Files +${addedFiles}/-${removedFiles}, Included changes: ${includedChanges}, Excluded changes: ${excludedChanges}`);
    }
  }, []);
  
  // Modify setAllFilesMap to track changes - define BEFORE handleLoadFiles
  const setAllFilesMapWithTracking = useCallback((update: FilesMap | ((prevState: FilesMap) => FilesMap)) => {
    setAllFilesMap(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      
      // Track changes between prev and next
      trackSelectionChanges('setAllFilesMap', prev, next);
      
      return next;
    });
  }, [setAllFilesMap, trackSelectionChanges]);
  
  // Load files function with debounce
  const handleLoadFiles = useCallback(async (directory: string, isRefresh = false, forceLoad = false) => {
    // Skip if no directory or already loading
    if (!directory) return;
    
    // Guard against concurrent loads
    if (loadFilesRef.current.isLoading && !forceLoad) {
      console.log(`[Load Files] Skipping load for ${directory} - already loading`);
      return;
    }
    
    // Skip if we've loaded this directory recently and it's not a forced refresh
    const now = Date.now();
    const timeSinceLastLoad = now - loadFilesRef.current.lastLoadTime;
    if (
      !isRefresh && 
      !forceLoad && 
      loadFilesRef.current.lastDirectory === directory && 
      timeSinceLastLoad < MIN_LOAD_INTERVAL
    ) {
      console.log(`[Load Files] Skipping load for ${directory} - loaded ${timeSinceLastLoad}ms ago`);
      return;
    }
    
    // Save existing selections BEFORE marking as loading or modifying state
    // This ensures we capture the current state before any changes
    const existingSelections = isRefresh ? new Map(
      Object.entries(allFilesMap).map(([path, info]) => [path, {
        included: info.included,
        forceExcluded: info.forceExcluded
      }])
    ) : null;
    
    // Mark as loading
    loadFilesRef.current.isLoading = true;
    
    if (!isRefresh) {
      console.log(`[Load Files] Starting load for ${directory}`);
      setIsLoadingFiles(true);
      setLoadingStatus("Initializing...");
      setAllFilesMap({}); // Clear files map when not refreshing
      setFileContentsMap({});
      setError(""); // Clear errors on new load
    } else {
      console.log(`[Refresh Files] Refreshing files from ${directory}`);
      console.log(`[Refresh Files] Preserving selections for ${existingSelections ? existingSelections.size : 0} files`);
      setIsLoadingFiles(true);
      setLoadingStatus("Refreshing files from git repository...");
    }
    
    // Clear error state
    setError("");
    
    try {
      // For initial load, check for cached file selections *before* fetching files
      let initialIncludedSet = new Set<string>();
      let initialExcludedSet = new Set<string>();      

      // Update status before reading files
      setLoadingStatus(isRefresh ? "Refreshing git repository files..." : "Reading all non-ignored files via git...");
      
      // Call server action to read files
      const result = await readDirectoryAction(directory);
      
      // Update load tracking after successful server call
      loadFilesRef.current.lastDirectory = directory;
      loadFilesRef.current.lastLoadTime = Date.now();
      
      // Handle errors
      if (!result.isSuccess) {
        setError(result.message || `Failed to read git repository at ${directory}`);
        setIsLoadingFiles(false);
        setLoadingStatus("");
        return;
      }
      if (!result.data || Object.keys(result.data).length === 0) {
        // Don't set an error here, just show empty list in FileBrowser
        setError("No text files found in the git repository. Files may be binary or in .gitignore.");
        return;
      }
      
      // Process loaded files
      setLoadingStatus(isRefresh ? "Processing refreshed files..." : "Processing files from git repository...");
      console.log(`Successfully read ${Object.keys(result.data).length} files from git repository`);
      
      // Create a new files map with file info
      const newFilesMap: FilesMap = {};
      
      // Log before processing for debugging purposes
      console.log(`[${isRefresh ? 'Refresh' : 'Load'}] Starting file processing with ${isRefresh ? 'existing' : 'empty'} map. File count from server:`, Object.keys(result.data).length);
      
      // Process each file - only include files that actually exist in the current result
      const fileContents = result.data;
      const paths = Object.keys(fileContents);
      
      // Debug information for external paths
      const pathDebugData: { original: string, normalized: string }[] = [];
      const pathWarnings: string[] = [];
      
      // Process each file
      for (const path of paths) {
        const content = fileContents[path];
        const size = content.length;
        
        try {
          // Check for path normalization issues (could happen with Windows paths)
          const normalizedPath = normalizeFilePath(path);
          if (normalizedPath !== path) {
            pathDebugData.push({ original: path, normalized: normalizedPath });
          }
          
          // Security check: Skip paths trying to go outside the project directory
          if (normalizedPath.startsWith('..') || normalizedPath.startsWith('/')) {
            pathWarnings.push(`Warning: Path ${normalizedPath} appears to be outside project directory`);
            continue;
          }
        } catch (e) {
          console.error(`Error normalizing path ${path}:`, e);
        }
        
        // When refreshing, try to preserve selections from existing map
        let included = false; // Default to not included
        let forceExcluded = false; // Default to not excluded

        if (isRefresh) {
          if (existingSelections?.has(path)) {
            // If refreshing and the file existed before, preserve its previous state
            const existing = existingSelections.get(path)!;
            included = existing.included;
            forceExcluded = existing.forceExcluded;
          } else {
            // For new files discovered during refresh, use default selection logic
            included = shouldIncludeByDefault(path);
            forceExcluded = false;
          }
        } else {
          // For initial load (not refreshing), use default selection logic
          included = initialIncludedSet.has(path) || (!initialExcludedSet.has(path) && shouldIncludeByDefault(path));
          forceExcluded = initialExcludedSet.has(path);
        }

        newFilesMap[path] = {
          path,
          size,
          included,
          forceExcluded
        };
      }
      
      // Set debugging data if needed
      setPathDebugInfo(pathDebugData);
      setExternalPathWarnings(pathWarnings);
      // Update state with new data
      setFileContentsMap(result.data); // Keep using result.data directly
      // Directly update the file map state to trigger FormStateManager
      setAllFilesMapWithTracking(newFilesMap);
      
      console.log(`[${isRefresh ? 'Refresh' : 'Load'}] Processed ${Object.keys(newFilesMap).length} files from git repository.`);
    } catch (error) {
      console.error(`Error ${isRefresh ? 'refreshing' : 'loading'} files:`, error);
      setError(`Failed to ${isRefresh ? 'refresh' : 'load'} files: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingFiles(false);
      handleInteraction(); // Trigger save check after files are loaded/refreshed
      loadFilesRef.current.isLoading = false; // Mark as no longer loading
    } 
  }, [allFilesMap, handleInteraction, normalizeFilePath, setAllFilesMapWithTracking]);
  
  // Use stable version for handleRefreshFiles
  const handleRefreshFiles = useCallback(async () => {
    if (!projectDirectory) return;
    
    console.log(`[Refresh] Starting file refresh operation for ${projectDirectory}`);
    setIsRefreshingFiles(true);
    setLoadingStatus("Refreshing files from git repository...");
    
    try {
      // Invalidate caches before refresh
      invalidateDirectoryCache(projectDirectory);
      invalidateFileCache(projectDirectory);
      repository.clearCache(); // Clear client-side cache before manual refresh
      
      // Force refresh with forceLoad=true to bypass throttling
      await handleLoadFiles(projectDirectory, true, true);
      handleInteraction(); // Trigger save check after refresh completes
      console.log(`[Refresh] Successfully refreshed files for ${projectDirectory}`);
    } catch (error) {
      console.error("[Refresh] Error refreshing files:", error);
      setError(`Failed to refresh files: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Ensure the refresh state is reset
      setIsRefreshingFiles(false); // Ensure refresh state is reset here
      setLoadingStatus(""); // Clear status after potentially setting error
    }
  }, [projectDirectory, repository, handleLoadFiles]);

  // Load initial data when project directory or format changes
  useEffect(() => {
    // Skip if not initialized or missing projectDirectory or repository
    if (!projectDirectory || !repository || !initializationRef.current.projectInitialized) {
      return;
    }
    
    // Check URL parameter first
    const urlProjectDir = searchParams.get('projectDir');
    const initialDir = urlProjectDir ? decodeURIComponent(urlProjectDir) : projectDirectory;
    
    if (!initialDir || !repository) {
      // Clear state if no project directory or format
      setAllFilesMap({});
      setFileContentsMap({});
      handleSetActiveSessionId(null); // Use the handler to clear session
      setSessionInitialized(false); // No active session
      return;
    }

    console.log(`[Form Init] Project selected: ${initialDir}. Initializing...`);
    
    const initializeProjectData = async (dirToLoad: string) => {
      // Reset initialization before starting
      // initializationRef.current.projectInitialized = false; // Keep this commented out or manage carefully
      setIsRestoringSession(true); // Indicate session restore attempt

      try {
        // No longer clearing the active session when project directory changes
        // Set session as not initialized until we confirm the active session for the new project
        setSessionInitialized(false); // Reset initialization status for this load
        console.log(`[Form Init] Starting initialization for project: ${dirToLoad}`);

        // STEP 1: Load files first
        console.log(`[Form Init] Loading files for project '${dirToLoad}'...`);
        await handleLoadFiles(dirToLoad, false);
        console.log(`[Form Init] Files loaded for project '${dirToLoad}'.`);

        // STEP 2: Fetch the active session ID for the NEW project
        console.log(`[Form Init] Fetching active session ID for NEW project '${dirToLoad}' from DB...`);
        const savedActiveSessionId = await repository.getActiveSessionId(dirToLoad);
        console.log(`[Form Init] Found active session ID in DB for NEW project '${dirToLoad}': ${savedActiveSessionId || 'none'}`);

        // STEP 3: Set the active session ID state (this updates the prop for SessionManager)
        console.log(`[Form Init] Setting active session ID state to: ${savedActiveSessionId || 'null'}`);
        handleSetActiveSessionId(savedActiveSessionId); // Set internal state FIRST


        // STEP 3: Set the active session ID (or null) for this project in the form state
        // This will trigger SessionManager to update its highlighted item if necessary
        console.log(`[Form Init] Setting active session ID in form state to: ${savedActiveSessionId || 'null'}`);
        handleSetActiveSessionId(savedActiveSessionId); // Set internal state and persist if needed

        if (savedActiveSessionId) {
          console.log(`[Form Init] Active session ID ${savedActiveSessionId} found for new project. Attempting to load session data...`);
          const sessionToLoad = await repository.getSession(savedActiveSessionId);
          if (sessionToLoad) {
              console.log(`[Form Init] Calling handleLoadSession for ${savedActiveSessionId}`);
              handleLoadSession(sessionToLoad); // Load the session data into the form state
          } else {
              console.warn(`[Form Init] Active session ${savedActiveSessionId} not found in DB. Clearing active session.`);
              handleSetActiveSessionId(null); // Clear if session doesn't exist
          }
        } else {
             // If no active session for the new project, clear form fields
             setTaskDescription("");
             setSearchTerm("");
             setPastedPaths("");
             setPatternDescription("");
             setTitleRegex("");
             setContentRegex("");
             setPrompt("");
             setTokenCount(0);
          // Note: The actual loading of session *data* is handled by SessionManager via onLoadSession triggered by handleLoadSession
             console.log("[Form Init] No active session for new project, form fields reset.");
        }

        // Mark initialization as complete
        initializationRef.current.projectInitialized = true;
      } catch (error) {
        console.error("Error initializing project data:", error);
        setError(`Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`);
        // Do not reset projectInitialized here, let it stay true to prevent loops, but sessionInitialized might be false
        // initializationRef.current.projectInitialized = false;
        setSessionInitialized(false);
      } finally {
        setIsRestoringSession(false); // Finished attempt
      }
    };
    
    // Only run initialization if project changed or not yet initialized for this project, and not currently loading files
    // Check against normalized paths if possible, or ensure consistent handling
    const currentLoadedDir = loadFilesRef.current.lastDirectory;
    // Ensure we only run if the directory *actually* changed and we are not already loading
    if (projectDirectory && normalizePath(projectDirectory) !== normalizePath(currentLoadedDir || "") && !isLoadingFiles && !isRestoringSession) {
      initializeProjectData(initialDir);
      // handleInteraction(); // Avoid marking interaction during initial load/project switch
    }
  }, [projectDirectory, repository, handleLoadFiles, searchParams, handleSetActiveSessionId, handleInteraction]);

  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  const handleTaskChange = useCallback(async (value: string) => {
    // Always update local state immediately
    setTaskDescription(value);
    // Do not clear active session ID automatically on input change
    handleInteraction(); // Mark interaction
    
    try {
      // Code to save task description would go here
      // This part seems to be missing in the original code
    } catch (error) {
      // Detailed error logging
      console.error("Error saving task description:", error);
      
      // Show error in UI for user feedback with more details
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Failed to save task description: ${errorMessage}`);
      
      // Clear error after a few seconds
      setTimeout(() => {
        setError(prev => {
          if (prev.includes("Failed to save task description")) {
            return "";
          }
          return prev;
        });
      }, 5000); // Clear error after 5 seconds
    }
  }, [activeSessionId, projectDirectory, repository, handleInteraction]); // Keep handleInteraction dependency

  // New handler specifically for transcribed text
  const handleTranscribedText = useCallback((text: string) => {
    // Insert at cursor position instead of replacing entire content
    if (taskDescriptionRef.current) {
      taskDescriptionRef.current.insertTextAtCursorPosition(text);
    } else {
      // Fallback: Append to the end if ref not available
      const newText = taskDescription + (taskDescription ? ' ' : '') + text;
      setTaskDescription(newText);
      handleInteraction();
    }
  }, [taskDescription, handleInteraction]);

  const handleSearchChange = useCallback((value: string) => { // Keep useCallback
    setSearchTerm(value);
    handleInteraction();
  }, [handleInteraction]); // Add handleInteraction dependency

  // Function to clean XML tags from pasted paths
  const cleanXmlTags = useCallback((input: string): string => {
    return input.split('\n')
      .map(line => line.replace(/<file>|<\/file>/g, '').trim())
      .join('\n');
  }, []);

  // Handler for updating pastedPaths
  const handlePastedPathsChange = useCallback((value: string) => {
    // Clean any XML tags that might be present
    const cleanedValue = cleanXmlTags(value);
    setPastedPaths(cleanedValue);
    handleInteraction(); // Mark interaction
  }, [cleanXmlTags, handleInteraction]);

  const handlePatternDescriptionChange = useCallback((value: string) => { // Keep useCallback
    setPatternDescription(value);
    handleInteraction();
  }, [handleInteraction]); // Add handleInteraction dependency

  const handleTitleRegexChange = useCallback((value: string) => { // Keep useCallback
    setTitleRegex(value);
    handleInteraction();
  }, [handleInteraction]); // Add handleInteraction dependency

  const handleContentRegexChange = useCallback((value: string) => { // Keep useCallback
    setContentRegex(value);
    handleInteraction();
  }, [handleInteraction]); // Add handleInteraction dependency

  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    setContentRegexError(null);
    handleInteraction();
  }, []);

  const handleToggleRegexActive = useCallback(() => {
    const newValue = !isRegexActive;
    setIsRegexActive(newValue);
    handleInteraction();
  }, [isRegexActive, handleInteraction]); // Added handleInteraction dependency

  const handleGenerateRegex = useCallback(async () => {
    if (!patternDescription.trim()) { // Ensure description is not empty
      setRegexGenerationError("Please enter a pattern description first.");
      return; // Exit if description is empty
    }

    setIsGeneratingRegex(true);
    setRegexGenerationError(""); // Clear previous errors
    try {
      console.log("Generating regex patterns for:", patternDescription);
      const result = await generateRegexPatternsAction(patternDescription, undefined);
      console.log("Regex generation result:", result);
      
      if (result.isSuccess && result.data) {
        const newTitleRegex = result.data.titleRegex || "";
        setTitleRegexError(null); // Clear title error on success
        const newContentRegex = result.data.contentRegex || "";
        setTitleRegex(newTitleRegex);
        setContentRegex(newContentRegex);
        setRegexGenerationError("");
        handleInteraction(); // Mark interaction
      } else {
        setRegexGenerationError(result.message || "Failed to generate regex patterns.");
      }
    } catch (error) {
      console.error("Error in handleGenerateRegex:", error);
      setRegexGenerationError(error instanceof Error ? error.message : "Unexpected error generating regex patterns");
    } finally {
      setIsGeneratingRegex(false);
    }
  }, [patternDescription, handleInteraction]); // Added handleInteraction

  // Handler for the new "Find Relevant Files" button
  const handleFindRelevantFiles = useCallback(async () => {
    if (!projectDirectory || !taskDescription) {
      setError("Please specify a project directory and task description first");
      return;
    }

    setIsFindingFiles(true);
    setError("");
    setLoadingStatus("Loading project files...");
    setExternalPathWarnings([]);

    try {
      // First, load ALL project files
      const allFilesResult = await readDirectoryAction(projectDirectory);
      if (!allFilesResult.isSuccess || !allFilesResult.data) {
        setError(`Failed to read project files: ${allFilesResult.message || "Unknown error"}`);
        return;
      }
      
      const allProjectFiles = allFilesResult.data;
      const projectFilePaths = Object.keys(allProjectFiles);
      
      // If searchSelectedFilesOnly is true, filter to only use selected files
      let filesToAnalyze = projectFilePaths;
      if (searchSelectedFilesOnly) {
        // Filter to only include files that are selected in the file browser
        const selectedFiles = Object.entries(allFilesMap)
          .filter(([_, fileInfo]) => fileInfo.included && !fileInfo.forceExcluded)
          .map(([path, _]) => path);
        
        if (selectedFiles.length === 0) {
          setError("No files are selected. Please select files first or disable 'Search in selected files only'.");
          setIsFindingFiles(false);
          return;
        }
        
        filesToAnalyze = selectedFiles;
        setLoadingStatus(`Analyzing ${selectedFiles.length} selected files...`);
        console.log(`Using ${selectedFiles.length} selected files for analysis`);
      } else {
        console.log(`Loaded ${projectFilePaths.length} files from project`);
        setLoadingStatus("Analyzing ALL project files...");
      }
      
      // Then find relevant files
      const result = await findRelevantFilesAction(
        projectDirectory, 
        taskDescription,
        searchSelectedFilesOnly ? filesToAnalyze : undefined
      );

      if (result.isSuccess && result.data?.relevantPaths) {
        const relevantPaths = result.data.relevantPaths;
        
        // Process paths to ensure they don't contain XML tags
        const cleanPaths = relevantPaths.map(path => {
          // Remove any XML tags that might be present
          return path.replace(/<file>|<\/file>/g, '').trim();
        });
        
        setPastedPaths(cleanPaths.join('\n'));
        
        // Use the enhanced task description from the combined API call
        if (result.data.enhancedTaskDescription) {
          const enhancedText = result.data.enhancedTaskDescription;
          
          // Use the ref to append the enhanced text
          if (taskDescriptionRef.current) {
            // Create enhanced text with header
            const enhancedTextWithHeader = "Additional Context Based on Codebase Analysis:\n\n" + enhancedText;
            taskDescriptionRef.current.appendText(enhancedTextWithHeader);
          } else {
            // Fallback if ref not available: append to the existing task description
            setTaskDescription(prevTask => {
              const separator = "\n\n";
              return prevTask + separator + "Additional Context Based on Codebase Analysis:\n\n" + enhancedText;
            });
          }
          
          console.log("Successfully enhanced task description based on code analysis");
        }
        
        handleInteraction(); // Mark interaction
      } else {
        setError(`Failed to find relevant files: ${result.message}`);
      }
    } catch (error) {
      console.error("Error processing code analysis:", error);
      setError(`Error in code analysis: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsFindingFiles(false);
      setLoadingStatus("");
    }
  }, [taskDescription, projectDirectory, handleInteraction, taskDescriptionRef, searchSelectedFilesOnly, allFilesMap]);

  // New handler to add a file path to the pastedPaths textarea
  const handleAddPathToPastedPaths = useCallback((path: string) => {
    // Split the current paths by newline, filter out empty lines and comments
    const currentPaths = pastedPaths
      .split("\n")
      .map(p => p.trim())
      .filter(p => !!p && !p.startsWith("#"));
    
    // Check if the path already exists in the textarea
    if (!currentPaths.includes(path)) {
      // Determine how to add the new path based on current content
      const newPastedPaths = pastedPaths.trim() 
        ? pastedPaths.trim() + "\n" + path  // Add to existing content
        : path;                             // Set as first path
      
      // Update the state
      setPastedPaths(newPastedPaths);
      handleInteraction();
    }
  }, [pastedPaths, handleInteraction]);

  // Handle paths preview (placeholder function to avoid error)
  const handlePathsPreview = useCallback(() => {
    // This function is required by the PastePaths component
    // but we're not using its preview functionality
    console.log("Path preview requested");
  }, []);

  // Update allFilesMap state from child components
  const handleFilesMapChange = useCallback((newMap: FilesMap) => {
    setAllFilesMap(newMap);
    console.log('[Form] handleFilesMapChange called, triggering interaction.'); // Add log
    handleInteraction(); // Mark interaction
  }, [handleInteraction]); // Add handleInteraction to dependency array

  const handleGenerate = async () => {
    /**
     * Generates a prompt by:
     * 1. Always reading fresh file contents directly from the file system
     * 2. Using either the file browser selection or pasted paths to determine which files to include
     * 3. Generating the formatted prompt with the latest file contents
     */
    setIsLoading(true);
    setError(""); // Clear previous errors
    setLoadingStatus("Preparing files...");
    setPrompt(""); // Clear previous prompt output
    setExternalPathWarnings([]);

    try {
      // Refresh file contents from the file system for project files
      setLoadingStatus("Reading file contents...");
      
      // Get fresh contents for project files
      let currentFileContents: { [key: string]: string } = {};
      
      if (projectDirectory) { // Check if projectDirectory exists
        const freshResult = await readDirectoryAction(projectDirectory); // Use fresh results
        if (freshResult.isSuccess && freshResult.data) {
          currentFileContents = { ...freshResult.data };
        } else {
          setError("Failed to read current file contents: " + freshResult.message);
          setIsLoading(false);
          setLoadingStatus("");
          return;
        }
      } else {
        setError("No project directory specified");
        setIsLoading(false);
        setLoadingStatus("");
        return;
      }

      const hasPastedPaths = pastedPaths.trim().length > 0; 
      const isAnyFileIncludedFromBrowser = Object.values(allFilesMap || {}).some((f) => f.included && !f.forceExcluded); // Corrected file check

      // Determine which files to use based on pasted paths or browser selection
      let filesToUse: string[] = [];
      const warnings: string[] = [];

      if (hasPastedPaths) {
        setLoadingStatus("Processing pasted paths...");
        // Create a normalized map for better file path matching
        const normalizedFileContentsMap = Object.keys(currentFileContents).reduce((acc, key) => {
          const normalizedKey = normalizePath(key, projectDirectory);
          acc[normalizedKey] = key; // Store the original key
          return acc as Record<string, string>;
        }, {} as Record<string, string>);
        
        const rawPastedPaths = pastedPaths
          .split("\n")
          .map((p) => p.trim())
          .filter((p) => !!p && !p.startsWith("#")); // Allow external paths

        const projectFilePaths = new Set(Object.keys(currentFileContents || {})); // Use fresh file contents

        for (const filePath of rawPastedPaths) {
          // Try to normalize the path if it's not an absolute path
          const normalizedPath = normalizePath(filePath, projectDirectory);
          
          // Check if the path exists in our normalized map
          if (normalizedFileContentsMap[normalizedPath]) { // Use normalized lookup
            // Use the original path from the map
            const originalPath = normalizedFileContentsMap[normalizedPath];
            filesToUse.push(originalPath);
          }
          else if (projectFilePaths.has(filePath)) { // Check project files directly
            // Original path lookup - if it exists in our current content map
            if (currentFileContents[filePath] !== undefined) {
              filesToUse.push(filePath);
            } else {
              // Should theoretically not happen if we just got fresh content
              warnings.push(`Could not find content for project path "${filePath}".`);
              console.warn(`Content missing for project path: ${filePath}`);
            }
          } else {
            // Path is potentially external (absolute or relative outside project root)
            setLoadingStatus(`Reading external file: ${filePath}...`); // Update status message
            const externalFileResult = await readExternalFileAction(filePath);

            // Process the external file result
            if (externalFileResult.isSuccess && externalFileResult.data) {
              // Merge external content into our temporary map for this generation
              // Convert any Buffer objects to strings before merging
              const processedData = Object.entries(externalFileResult.data).reduce((acc, [key, value]) => {
                acc[key] = typeof value === 'string' ? value : value.toString('utf-8');
                return acc;
              }, {} as Record<string, string>);
              
              currentFileContents = { ...currentFileContents, ...processedData };
              // Add the path (using the key from externalFileResult.data, which should be the original input path)
              const addedPath = Object.keys(externalFileResult.data)[0];
              filesToUse.push(addedPath);
            } else {
              warnings.push(`Could not read external path "${filePath}": ${externalFileResult.message}`);
              console.warn(`Failed to read external file ${filePath}: ${externalFileResult.message}`);
            }
          }
        }

        if (filesToUse.length === 0 && rawPastedPaths.length > 0) {
             setError("None of the pasted paths could be read or found. Check paths and permissions."); // Set error message
             setIsLoading(false); // Reset loading state
             setLoadingStatus("");
             if (warnings.length > 0) setExternalPathWarnings(warnings); // Show warnings if any
             return; // Exit if no usable pasted paths
        } // End if block for empty filesToUse after pasting
      } else if (isAnyFileIncludedFromBrowser) {
        setLoadingStatus("Using selected files...");
        // No pasted paths, use files selected in the browser from the state
        // Filter the *currentFileContents* using the selection state from *allFilesMap*
        const selectedPaths = new Set(Object.values(allFilesMap).filter(f => f.included && !f.forceExcluded).map(f => f.path));


        // Create a map of normalized paths to original paths for better matching
        const normalizedToOriginal: Record<string, string> = {};
        Object.keys(currentFileContents).forEach(originalPath => {
          const normalizedPath = normalizePath(originalPath, projectDirectory); // Use normalizePath utility
          normalizedToOriginal[normalizedPath] = originalPath;
        });
        
        // Check both original and normalized paths to ensure we find matches
        filesToUse = Object.keys(currentFileContents) // Use Object.keys(currentFileContents)
          .filter(path => selectedPaths.has(path) && currentFileContents[path] !== undefined); // Match against selectedPaths

        
        // Log resolved files for debugging if needed
        // console.log("Resolved files from browser:", filesToUse);
        console.log("Files to use:", filesToUse);
      } else {
        // Neither pasted paths nor browser selection
        setError("Please include at least one file using the file browser or paste file paths.");
        setIsLoading(false);
        setLoadingStatus("");
        return;
      }

      if (warnings.length > 0) { // Set warnings if any occurred
        setExternalPathWarnings(warnings);
      }

      // Generate file contents markup using the freshly loaded currentFileContents
      setLoadingStatus("Generating prompt markup...");
      const fileContentMarkup = Object.entries(currentFileContents)
        .filter(([filePath]) => filesToUse.includes(filePath)) // Filter using the determined filesToUse
        .map(([path, content]) => `<file>
<file_path>${path}</file_path>
<file_content>
${content}
</file_content>
</file>`)
        .join("\n\n");

      let instructions = await getDiffPrompt(); // Always use diff prompt
      // No longer need the replace operations as the prompt structure has been updated
      
      const fullPrompt = `${instructions}

<project_files>
${fileContentMarkup}
</project_files>

<task>
${taskDescription}
</task>`;

      setPrompt(fullPrompt);
      // Use await with estimateTokens since it returns a Promise
      const tokenEstimate = await estimateTokens(fullPrompt);
      setTokenCount(tokenEstimate);
      
      // Update state with fresh file contents for future operations
      setFileContentsMap(currentFileContents);
    } catch (error) {
      setError("Failed to generate prompt");
      console.error("Error during prompt generation:", error); // Log the error
    } finally {
      setIsLoading(false);
      setLoadingStatus(""); // Clear loading status
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt); // Copy prompt to clipboard
      setCopySuccess(true); // Set success state
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  // Function to get the current state for saving a session
  const getCurrentSessionState = useCallback((): Omit<Session, "id" | "name" | "updatedAt"> => {
    const includedFiles = Object.values(allFilesMap)
      .filter(f => f.included && !f.forceExcluded) // Filter included files
      .map(f => f.path);

    // Get force excluded files // Keep comment
    const forceExcludedFiles = Object.values(allFilesMap)
      .filter(f => f.forceExcluded) // Filter force excluded files
      .map(f => f.path);
    
    // Remove outputFormat and customFormat
    return {
      projectDirectory,
      taskDescription,
      searchTerm,
      pastedPaths,
      patternDescription,
      titleRegex,
      contentRegex,
      isRegexActive,
      includedFiles,
      forceExcludedFiles, // Add forceExcludedFiles
      // Add default values for required Gemini fields in Session type
      geminiStatus: 'idle' as const, // Default Gemini fields for state object with explicit type
      geminiStartTime: null, // Keep null default
      geminiEndTime: null,
      geminiPatchPath: null,
      geminiStatusMessage: null,
      geminiTokensReceived: 0, // Add default for new fields
      geminiCharsReceived: 0,
      geminiLastUpdate: 0, // Changed from null to 0 to match expected type
    }; // End return object
  }, [
    projectDirectory, 
    taskDescription, 
    searchTerm, 
    pastedPaths, 
    patternDescription, 
    titleRegex, 
    contentRegex, 
    isRegexActive, 
    allFilesMap, 
  ]);


  // Load session handler
  const handleLoadSession = useCallback((session: Session) => { // Keep function signature
    console.log(`Loading session: ${session.name} (${session.id})`);
    setTaskDescription(session.taskDescription || "");
    setProjectDirectory(session.projectDirectory); // Ensure project directory is also loaded
    setSearchTerm(session.searchTerm || "");
    setPastedPaths(session.pastedPaths || "");
    setPatternDescription(session.patternDescription || "");
    setTitleRegex(session.titleRegex || "");
    setIsRegexActive(session.isRegexActive ?? true); // Load isRegexActive state, default to true
    setContentRegex(session.contentRegex || "");
    // Removed outputFormat and customFormat
    
    // Apply file selections from the loaded session
    // Handle included/excluded files if they exist
    let mapChanged = false; // Track if the file map actually changed
    if (session.includedFiles && session.includedFiles.length > 0) {
      // We need to merge with current allFilesMap
      const updatedFilesMap = { ...allFilesMap };
      
      // Reset inclusion/exclusion based on loaded session
      Object.keys(updatedFilesMap).forEach(key => {
        updatedFilesMap[key] = { 
          // Directly modify the object, assuming allFilesMap contains FileInfo objects
          ...updatedFilesMap[key], 
          included: false,
          forceExcluded: false
        };
      });
      
      // Mark files from session as included
      session.includedFiles.forEach(filePath => {
        if (updatedFilesMap[filePath]) {
          updatedFilesMap[filePath].included = true;
          updatedFilesMap[filePath].forceExcluded = false; // Ensure forceExcluded is false if included
          mapChanged = true;
        }
      });
      
      // Mark force excluded files
      if (session.forceExcludedFiles) {
        session.forceExcludedFiles.forEach(filePath => {
          if (updatedFilesMap[filePath]) {
            updatedFilesMap[filePath].forceExcluded = true;
            updatedFilesMap[filePath].included = false; // Ensure included is false if forceExcluded
            mapChanged = true;
          }
        });
      }
      
      // Update state
      setAllFilesMap(updatedFilesMap);
    }
    
    // Make sure activeSessionId is set
    setActiveSessionId(session.id);
    setHasUnsavedChanges(false); // Mark as saved state initially
    setSessionInitialized(true);
    if (mapChanged) {
      handleInteraction(); // Trigger save check if file map was modified by loading session
    }
    // Do not set initializationRef.current.sessionRestoreAttempted = true here // Keep comment
    console.log(`[Form] Session ${session.id} loaded into form state. Active session ID set.`); 
  }, [allFilesMap, setProjectDirectory, handleInteraction]); // Added handleInteraction dependency

  // Helper function to construct form state for the FormStateManager
  // This helps ensure we always use the latest state without dependency issues
  const formStateForManager = useMemo(() => ({
    // Form fields
    projectDirectory,
    taskDescription,
    searchTerm,
    pastedPaths,
    patternDescription,
    titleRegex,
    contentRegex,
    isRegexActive,
    // File selections
    includedFiles: Object.values(allFilesMap)
      .filter(f => f.included && !f.forceExcluded)
      .map(f => f.path),
    forceExcludedFiles: Object.values(allFilesMap)
      .filter(f => f.forceExcluded)
      .map(f => f.path),
    // Gemini fields (default values for new sessions)
    geminiStatus: 'idle' as const,
    geminiStartTime: null,
    geminiEndTime: null,
    geminiPatchPath: null,
    geminiStatusMessage: null,
    geminiTokensReceived: 0,
    geminiCharsReceived: 0,
    geminiLastUpdate: 0,
  }), [
    projectDirectory, taskDescription, searchTerm, pastedPaths,
    patternDescription, titleRegex, contentRegex, isRegexActive, allFilesMap
  ]);

  // Reset initialization flag when project directory changes
  useEffect(() => {
    initializationRef.current.projectInitialized = false;
  }, [projectDirectory]);

  // Load context type preference
  useEffect(() => {
    const loadPreferences = async () => {
      if (repository && projectDirectory) {
        try {
          // Load context type preference
          const savedContextType = await repository.getCachedState(
            projectDirectory,
            CONTEXT_TYPE_KEY
          );
          if (savedContextType === "files" || savedContextType === "vector") {
            setContextType(savedContextType);
          }
          
          // Load output format preference
          const savedOutputFormat = await repository.getCachedState(
            projectDirectory,
            OUTPUT_FORMAT_KEY
          );
          if (savedOutputFormat) {
            setOutputFormat(savedOutputFormat as OutputFormat);
          }
          
          // Load search selected files only preference
          const savedSearchSelectedFilesOnly = await repository.getCachedState(
            projectDirectory,
            SEARCH_SELECTED_FILES_ONLY_KEY
          );
          setSearchSelectedFilesOnly(savedSearchSelectedFilesOnly === "true");
        } catch (e) {
          console.error("Failed to load preferences:", e);
        }
      }
    };
    
    loadPreferences();
  }, [projectDirectory, repository]);

  const showLoadingOverlay = isLoadingFiles || isRestoringSession || isRefreshingFiles;

  // Toggle search selected files only
  const toggleSearchSelectedFilesOnly = async () => {
    const newValue = !searchSelectedFilesOnly;
    setSearchSelectedFilesOnly(newValue);
    
    if (projectDirectory && repository) {
      try {
        await repository.saveCachedState(
          projectDirectory,
          SEARCH_SELECTED_FILES_ONLY_KEY,
          String(newValue)
        );
      } catch (error) {
        console.error("Failed to save 'searchSelectedFilesOnly' preference:", error);
      }
    }
    
    handleInteraction();
  };

  // Toggle output format
  const toggleOutputFormat = async () => {
    // ... existing code ...
  };

  return (
    <div className="flex flex-col flex-1 space-y-6"> {/* Removed padding */}
      <div className="grid grid-cols-1 gap-4">
        {/* Project Directory Selector - Always visible, handles its own loading/initialization */}
        {/* Removed the isInitialized check here as the selector should handle its own lifecycle */}
        {/* Pass the refresh handler and loading state */}

        <ProjectDirectorySelector onRefresh={handleRefreshFiles} isRefreshing={isRefreshingFiles} />
      
        {/* Session Manager - Now placed directly after Project Directory Selector */}
        <Suspense fallback={<div>Loading session manager...</div>}>
          <SessionManager 
            projectDirectory={projectDirectory}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={handleLoadSession}
            activeSessionId={activeSessionId}
            setActiveSessionIdExternally={handleSetActiveSessionId}
            sessionInitialized={sessionInitialized} // Pass sessionInitialized status
            onSessionStatusChange={(hasSession: boolean) => setSessionInitialized(hasSession)}
            onSessionNameChange={(name: string) => {}} // No longer need to manage session name here
          />
          {/* Display auto-save errors near session manager */}
          {sessionSaveError && (
          // Conditionally render based on sessionSaveError
            <div className="text-xs text-destructive text-center mt-0.5 -mb-2">
              ⚠️ Auto-save failed: {sessionSaveError}
            </div>
          )}
        </Suspense>
      
        {/* Loading/Initializing Overlay */}
        {showLoadingOverlay && (
            <div className="flex items-center justify-center p-6 bg-card border rounded-lg shadow-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-3" />
                <span>
                    {isRefreshingFiles ? "Refreshing files..." : isRestoringSession ? "Restoring session..." : isLoadingFiles ? "Loading project files..." : "Initializing..."}
                </span>
            </div>
        )}

        {/* SessionGuard ensures all form components are only shown when a session exists */}
        <Suspense fallback={<div className="h-[300px] flex items-center justify-center">Loading session manager...</div>}>
          <SessionGuard
            activeSessionId={activeSessionId}
            setActiveSessionId={handleSetActiveSessionId}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={handleLoadSession}
            sessionInitialized={sessionInitialized} // Pass sessionInitialized status
          >
            {/* FormStateManager handles auto-saving form state */}
            <FormStateManager // Wrap form elements inside FormStateManager
              activeSessionId={activeSessionId}
              projectDirectory={projectDirectory || ""} 
              formState={formStateForManager} // Pass the explicitly constructed state
              onStateChange={setHasUnsavedChanges} // Use setHasUnsavedChanges directly
              isSaving={isFormSaving}
              onSaveError={setSessionSaveError}
            >
              {/* Task Description with Voice Transcription */}
              <div className="flex flex-col w-full gap-4"> {/* Use gap for spacing */}
                <TaskDescriptionArea
                  ref={taskDescriptionRef}
                  value={taskDescription}
                  onChange={handleTaskChange}
                  onInteraction={handleInteraction}
                />
                <div className="flex justify-end">
                  <VoiceTranscription
                    onTranscribed={handleTranscribedText}
                    onInteraction={handleInteraction}
                  />
                </div>
              </div>

              {/* Pattern Description Input */}
              <Suspense fallback={<div>Loading pattern input...</div>}>
                <PatternDescriptionInput
                  value={patternDescription}
                  onChange={setPatternDescription}
                  onGenerateRegex={handleGenerateRegex}
                  isGenerating={isGeneratingRegex}
                  generationError={regexGenerationError}
                  onInteraction={handleInteraction}
                />
              </Suspense>

              {/* RegexInput component */}
              <RegexInput
                titleRegex={titleRegex}
                contentRegex={contentRegex}
                onTitleRegexChange={setTitleRegex}
                onContentRegexChange={setContentRegex}
                titleRegexError={titleRegexError}
                contentRegexError={contentRegexError}
                isRegexActive={isRegexActive}
                onRegexActiveChange={setIsRegexActive}
                onInteraction={handleInteraction} // Pass interaction handler
                onClearPatterns={handleClearPatterns} // Pass clear handler
              />

              {/* Paste Paths */}
              <PastePaths
                onChange={handlePastedPathsChange}
                value={pastedPaths}
                title="Select Files"
                subTitle="Paste file paths, one per line. Or use file browser below."
                error={error}
                onClear={() => setPastedPaths("")}
                onPathsLoaded={handlePathsPreview}
                placeholderContent={`# One file path per line
# Comments starting with # are ignored

# Paths should be relative to the selected project directory
# For example:
src/app/page.tsx
src/components/ui/button.tsx
lib/utils.ts
`}
              >
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleFindRelevantFiles}
                    disabled={isFindingFiles || !taskDescription.trim() || !projectDirectory}
                    title={!taskDescription.trim() ? "Enter a task description first" : 
                           !projectDirectory ? "Select a project directory first" :
                           "Analyze codebase structure to find relevant files and enhance your task description with helpful context"}
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    {isFindingFiles ? "Analyzing Codebase..." : "Analyze Codebase & Find Relevant Files"}
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={toggleSearchSelectedFilesOnly}
                    className={cn(
                      "flex gap-1.5 items-center whitespace-nowrap",
                      searchSelectedFilesOnly && "bg-accent"
                    )}
                    title={searchSelectedFilesOnly ? "Search in all files" : "Search only in selected files"}
                  >
                    {searchSelectedFilesOnly ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                    {searchSelectedFilesOnly ? "Selected Files Only" : "All Files"}
                  </Button>
                </div>
              </PastePaths>

              {/* File Browser */}
                {/* Conditionally render FileBrowser based on projectDirectory and file map */}
              <FileBrowser
                allFilesMap={allFilesMap} // Pass the full map
                fileContentsMap={fileContentsMap} // Pass the contents map
                onFilesMapChange={handleFilesMapChange}
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                titleRegexError={titleRegexError}
                contentRegexError={contentRegexError}
                onTitleRegexErrorChange={setTitleRegexError}
                onContentRegexErrorChange={setContentRegexError}
                titleRegex={titleRegex}
                contentRegex={contentRegex}
                isRegexActive={isRegexActive}
                onInteraction={handleInteraction}
                isLoading={isLoadingFiles}
                loadingMessage={loadingStatus} // Pass status as message
                onAddPath={handleAddPathToPastedPaths} // Add the new prop
              /> {/* Close FileBrowser */}

              {/* Generate Button */}
              <div className="flex flex-col pt-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-muted-foreground">
                    {hasUnsavedChanges && (
                      <span className="italic">Changes will be saved automatically</span>
                    )}
                  </div>
                  
                  <Button
                    type="button"
                    variant="default"
                    onClick={handleGenerate}
                    disabled={isLoading || isLoadingFiles}
                    className="px-6"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin h-4 w-4 mr-2" />
                        Generating...
                      </>
                    ) : (
                      "Generate Prompt"
                    )}
                  </Button>
                </div>

                {tokenCount > 0 && (
                  <div className="text-xs text-muted-foreground text-right">
                    Estimated token count: {tokenCount.toLocaleString()}
                  </div>
                )}
              </div>

              {/* Results Section */}
              {error && (
                <div className="text-red-500 bg-red-50 p-4 rounded border border-red-200 mb-4">
                  <p className="font-medium">Error:</p>
                  <p>{error}</p>
                </div>
              )}

              {prompt && (
                <div className="bg-muted p-4 rounded-lg mt-6 relative border shadow-inner">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">Generated Prompt</h3>
                    {prompt && <Button
                      type="button"
                      onClick={handleCopy}
                      variant={copySuccess ? "outline" : "secondary"}
                      size="sm"
                      className="text-xs"
                    >
                      {copySuccess ? "Copied!" : "Copy to Clipboard"}
                    </Button>}
                  </div>
                  <pre className="bg-background p-4 rounded-md overflow-auto whitespace-pre-wrap text-sm max-h-[650px]">
                    {prompt}
                  </pre>
                </div>
              )}
            </FormStateManager>
          </SessionGuard>
        </Suspense>

        {/* Message to guide user when no session is active */}
        {!activeSessionId && projectDirectory && !showLoadingOverlay && ( // Removed outputFormat check
          <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md">
            Select a project directory to begin. Create a new session or load an existing one.
          </div>
        )}

        {/* Gemini Processor Section - Render only when session is active */}
        {activeSessionId && projectDirectory && sessionInitialized && ( // Render Gemini controls only when session is fully active and initialized
            <Suspense fallback={<div>Loading Gemini Processor...</div>}>
              <GeminiProcessor prompt={prompt} activeSessionId={activeSessionId} />
            </Suspense>
        )}
      </div>
    </div>
  );
}
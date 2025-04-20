"use client";
// Keep React imports
import React, { useEffect, useState, useMemo, useCallback, Suspense, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { readDirectoryAction, readExternalFileAction, invalidateDirectoryCache } from "@/actions/read-directory-actions"; // Keep read-directory-actions import
import { findRelevantFilesAction } from "@/actions/path-finder-actions"; // Import the enhanced action
import { correctPathsAction } from "@/actions/path-correction-actions"; // Import path correction action
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { resetSessionStateAction } from "@/actions/session-actions"; // Import reset action
import { estimateTokens } from "@/lib/token-estimator";
import { getDiffPrompt } from "@/prompts/diff-prompt"; // Import only diff prompt
import ProjectDirectorySelector from "./_components/project-directory-selector"; // Keep ProjectDirectorySelector import
import { useProject } from "@/lib/contexts/project-context"; // Keep project-context import
import { useDatabase } from "@/lib/contexts/database-context"; // Keep useDatabase import
import { normalizePath } from "@/lib/path-utils"; // Import from the correct file
import FileBrowser from "./file-browser"; // Keep FileBrowser import
import RegexInput from "./_components/regex-input"; // Keep RegexInput import
import PastePaths from "./paste-paths";
import path from "path";
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
import { useGeminiProcessor } from '../gemini-processor/gemini-processor-context'; // Fix the import path

// Constants for form state handling
const FORM_ID = "generate-prompt-form";
const AUTO_SAVE_INTERVAL = 3000; // 3 seconds
const LOCAL_STORAGE_KEY = "o1pro.generate-prompt.form-state";
const MIN_LOAD_INTERVAL = 60000; // 1 minute minimum time between automatic file loads
const DEFAULT_INCLUDED_FILE_EXTENSIONS = ["js", "jsx", "ts", "tsx", "py", "rs", "go", "java", "c", "cpp", "h", "hpp", "cs", "php", "rb", "html", "css", "scss", "md", "json", "yml", "yaml", "txt"];
const EXCLUDE_FILE_NAMES = [".git", "node_modules", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".next", "dist", "build", "out", "coverage", ".DS_Store"];
const DEFAULT_EXCLUDE_PATTERNS = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/.next/**"];

// Define the OutputFormat type 
type OutputFormat = "markdown" | "xml" | "plain";

const TaskDescriptionArea = React.lazy(() => import("./_components/task-description").then(module => ({ default: module.default }))); // Lazy load TaskDescriptionArea
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
  const { repository } = useDatabase();
  const { activeSessionId: savedSessionId, setActiveSessionId: setSavedSessionId } = useProject();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { resetProcessorState } = useGeminiProcessor(); // Get the reset function from context
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
  const taskDescriptionRef = useRef<any>(null); // Keep ref for task description
  const [isFormSaving, setIsFormSaving] = useState(false); // State to track if FormStateManager is saving
  const [isRefreshingFiles, setIsRefreshingFiles] = useState(false); // Add state for refresh operation
  const [isFindingFiles, setIsFindingFiles] = useState(false); // State for Path Finder action
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnly] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("markdown");

  // Ref to control initial loading and prevent loops
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initializationRef = useRef<{ projectInitialized: boolean; formMounted: boolean; urlProjectInitialized: boolean; initializedProjectDir: string | null; }>({ projectInitialized: false, formMounted: false, urlProjectInitialized: false, initializedProjectDir: null });

  // Preference keys for saving user preferences
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

  // Add a state variable for project data loading status
  const [projectDataLoading, setProjectDataLoading] = useState(false);

  // Define the handleInteraction function to mark form interactions
  const handleInteraction = useCallback(() => {
    // Set the unsaved changes flag
    setHasUnsavedChanges(true);
    
    // Reset the timeout if it exists
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    
    // Set a timeout to auto-save if enabled in the future
    interactionTimeoutRef.current = setTimeout(() => {
      // Auto-save logic could go here if we add that feature
      interactionTimeoutRef.current = null;
    }, 500);
  }, []);

  // Now after handleInteraction, define handleLoadSession
  const handleLoadSession = useCallback(async (session: Session) => {
    console.log(`Loading session: ${session.name} (${session.id})`);
    setTaskDescription(session.taskDescription || "");
    setProjectDirectory(session.projectDirectory); // Ensure project directory is also loaded
    setSearchTerm(session.searchTerm || "");
    setPastedPaths(session.pastedPaths || "");
    setPatternDescription(session.patternDescription || "");
    setTitleRegex(session.titleRegex || "");
    setIsRegexActive(session.isRegexActive ?? true); // Load isRegexActive state, default to true
    setContentRegex(session.contentRegex || "");
    
    // Apply file selections from the loaded session
    // Use handleLoadFiles to ensure content is also loaded correctly
    let mapChanged = false; // Track if the file map actually changed
    if (session.includedFiles && session.includedFiles.length > 0) {
      // We need to merge with current allFilesMap
      const updatedFilesMap = { ...allFilesMap };
      
      // Reset inclusion/exclusion based on loaded session
      Object.keys(updatedFilesMap).forEach(key => {
        updatedFilesMap[key] = { 
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
    console.log(`[Form] Session ${session.id} loaded into form state. Active session ID set.`); 
  }, [
    projectDirectory, // Add projectDirectory as dependency
    setAllFilesMap,
    setProjectDirectory,
    handleInteraction,
    setTaskDescription,
    setSearchTerm,
    setPastedPaths,
    setPatternDescription,
    setTitleRegex,
    setIsRegexActive,
    setContentRegex,
    setActiveSessionId,
    setHasUnsavedChanges, // Keep these state setters
    setSessionInitialized
  ]);

  // Function to estimate token count
  const updateTokenCount = useCallback(async (text: string) => {
    const count = await estimateTokens(text);
    // Only update if count is different to avoid re-renders
    setTokenCount(prevCount => prevCount !== count ? count : prevCount);
  }, []);

  // --- URL Sync Effect ---
  useEffect(() => {
    // Skip if project context is still loading or form is not ready
    if (!repository || !initializationRef.current.formMounted) {
      return;
    }

    // Get the project directory from URL on mount (only once)
    const urlProjectDirRaw = searchParams.get('projectDir');
    
    if (!urlProjectDirRaw) {
      return;
    }
    
    const urlProjectDir = normalizePath(decodeURIComponent(urlProjectDirRaw));
    
    // Skip if URL doesn't have a project directory
    if (!urlProjectDir) {
      return;
    }
    
    // Only update on mount and only if URL has a different value than context
    if (!initializationRef.current.urlProjectInitialized && 
        urlProjectDir !== normalizePath(projectDirectory || "")) {
      console.log(`[Form URL] Setting project directory from URL on mount: ${urlProjectDir}`);
      setProjectDirectory(urlProjectDir);
      initializationRef.current.urlProjectInitialized = true;
    }
  }, [searchParams, setProjectDirectory, repository, projectDirectory]);

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
  const handleSetActiveSessionId = useCallback(async (sessionId: string | null) => {
    console.log(`[Form] Setting active session ID: ${sessionId || 'null'}`);
    
    setActiveSessionId(sessionId);
    setSessionInitialized(!!sessionId);
    
    if (!sessionId) {
      setHasUnsavedChanges(false);
    }
    
    setSessionSaveError(null);
    
    // Persist active session ID to database
    if (projectDirectory && repository) {
      try {
        console.log(`[Form] Persisting active session ID for project ${projectDirectory}: ${sessionId || 'null'}`);
        await repository.setActiveSession(projectDirectory, sessionId);
      } catch (error) {
        console.error('[Form] Failed to persist active session ID:', error);
        setSessionSaveError('Failed to save active session state');
      }
    }
  }, [projectDirectory, repository, setActiveSessionId, setSessionInitialized, setHasUnsavedChanges, setSessionSaveError]);

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
      // Use the shared normalization utility
      const normalized = normalizePath(filePath);
      return normalized;
    } catch (error) {
      console.warn(`Failed to normalize path: ${filePath}`, error);
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
  
  // Wrapper around setAllFilesMap to include tracking - define BEFORE handleLoadFiles
  const setAllFilesMapWithTracking = useCallback((update: FilesMap | ((prevState: FilesMap) => FilesMap)) => {
    setAllFilesMap(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      
      // Check if tracking is needed (e.g., based on debug mode)
      if (process.env.NODE_ENV === 'development') {
        trackSelectionChanges('setAllFilesMap', prev, next);
      }
      
      return next;
    });
  }, [setAllFilesMap, trackSelectionChanges]);
  
  // Update the handleLoadFiles function to remove hot reload detection and auto-retry
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
      let result = null;
      
      // Attempt to read the directory
      result = await readDirectoryAction(directory);
      
      // Update load tracking after successful server call
      loadFilesRef.current.lastDirectory = directory;
      loadFilesRef.current.lastLoadTime = Date.now();
      
      // Handle errors
      if (!result?.isSuccess) {
        setError(result?.message || `Failed to read git repository at ${directory}`);
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
      
      // Process each file - temporarily set defaults for all files
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
        
        // For now, just set default values for all files
        // If refreshing, we'll apply saved selections in a separate step after files are loaded
        let included = false;
        let forceExcluded = false;
        
        if (!isRefresh) {
          // For initial load (not refreshing), use default selection logic
          included = initialIncludedSet.has(path) || (!initialExcludedSet.has(path) && shouldIncludeByDefault(path));
          forceExcluded = initialExcludedSet.has(path);
        } else {
          // When refreshing, use default selection logic for now
          included = shouldIncludeByDefault(path);
          forceExcluded = false;
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
      setFileContentsMap(result.data);
      
      // Apply the file map update first
      setAllFilesMapWithTracking(newFilesMap);
      
      // If refreshing, restore previous selections after a short delay 
      // to ensure all file paths are properly initialized
      if (isRefresh && existingSelections && existingSelections.size > 0) {
        console.log(`[Refresh] Waiting to restore ${existingSelections.size} saved selections...`);
        
        // Use setTimeout to wait for the next render cycle
        setTimeout(() => {
          const updatedMap = { ...newFilesMap };
          let restoredCount = 0;
          
          // Apply saved selections to the new file map
          existingSelections.forEach((value, savedPath) => {
            if (updatedMap[savedPath]) {
              updatedMap[savedPath].included = value.included;
              updatedMap[savedPath].forceExcluded = value.forceExcluded;
              restoredCount++;
            }
          });
          
          console.log(`[Refresh] Restored ${restoredCount} of ${existingSelections.size} saved selections`);
          setAllFilesMapWithTracking(updatedMap);
        }, 100); // Short delay to ensure file paths are fully processed
      }
      
      console.log(`[${isRefresh ? 'Refresh' : 'Load'}] Processed ${Object.keys(newFilesMap).length} files from git repository.`);
    } catch (error) {
      console.error(`Error ${isRefresh ? 'refreshing' : 'loading'} files:`, error);
      setError(`Failed to ${isRefresh ? 'refresh' : 'load'} files: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingFiles(false);
      handleInteraction(); // Trigger save check after files are loaded/refreshed
      loadFilesRef.current.isLoading = false; // Mark as no longer loading
    } 
  }, [allFilesMap, handleInteraction, normalizeFilePath, readDirectoryAction, setAllFilesMap, setAllFilesMapWithTracking, setError, setExternalPathWarnings, setFileContentsMap, setIsLoadingFiles, setLoadingStatus, setPathDebugInfo, shouldIncludeByDefault]);

  // Use stable version for handleRefreshFiles
  const handleRefreshFiles = useCallback(async () => {
    if (!projectDirectory) return;
    
    console.log(`[Refresh] Starting file refresh operation for ${projectDirectory}`);
    setIsRefreshingFiles(true);
    setLoadingStatus("Refreshing files from git repository...");
    
    try { // Ensure try block wraps the entire operation
      console.log(`[Refresh] Caches invalidated, proceeding with file load.`);
      
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
    // Skip if DB not initialized, missing project directory, or still in early loading phase
    if (!repository || !projectDirectory || !initializationRef.current.formMounted) {
      return;
    }
    
    // Normalize the directory for consistent comparison
    const normalizedProjectDir = normalizePath(projectDirectory);
    console.log(`[Form Init] Project selected: ${normalizedProjectDir}. Initializing...`);
    
    // Skip if already initialized for this project
    if (initializationRef.current.initializedProjectDir === normalizedProjectDir) {
      console.log(`[Form Init] Already initialized for project: ${normalizedProjectDir}`);
      return;
    }
    
    const initializeProjectData = async (dirToLoad: string) => {
      console.log(`[Form Init] Starting project data initialization for: ${dirToLoad}`);
      setProjectDataLoading(true);
      
      try {
        // First, load file list for the project
        await handleLoadFiles(dirToLoad);
        
        // Then load the active session ID for this project
        console.log(`[Form Init] Loading active session ID for project: ${dirToLoad}`);
        const savedActiveSessionId = await repository.getActiveSessionId(dirToLoad);
        
        if (savedActiveSessionId) {
          console.log(`[Form Init] Active session ID ${savedActiveSessionId} found for project. Loading session...`);
          try {
            const sessionToLoad = await repository.getSession(savedActiveSessionId);
            
            if (sessionToLoad) {
              console.log(`[Form Init] Loading session data: ${sessionToLoad.name}`);
              handleLoadSession(sessionToLoad);
            } else {
              // Session ID exists but session not found - clear active session
              console.warn(`[Form Init] Active session ${savedActiveSessionId} not found in DB. Clearing active session.`);
              await repository.setActiveSession(dirToLoad, null);
              handleSetActiveSessionId(null);
              clearFormFields();
            }
          } catch (error) {
            console.error(`[Form Init] Error loading active session: ${error}`);
            // Clear active session on error
            await repository.setActiveSession(dirToLoad, null);
            handleSetActiveSessionId(null);
            clearFormFields();
          }
        } else {
          // No active session for this project - clear form
          console.log("[Form Init] No active session for project, clearing form fields");
          clearFormFields();
        }
        
        // Mark as initialized for this project directory
        initializationRef.current.initializedProjectDir = normalizedProjectDir;
        initializationRef.current.projectInitialized = true;
      } catch (error) {
        console.error(`[Form Init] Error initializing project data: ${error}`);
        // Reset state on error
        setAllFilesMap({});
        setFileContentsMap({});
        handleSetActiveSessionId(null);
        clearFormFields();
      } finally {
        setProjectDataLoading(false);
      }
    };
    
    // Start initialization process
    initializeProjectData(normalizedProjectDir);
  }, [projectDirectory, repository, handleLoadFiles, handleSetActiveSessionId, handleLoadSession]);

  // Add this utility function for clearing form fields
  const clearFormFields = useCallback(() => {
    setTaskDescription("");
    setSearchTerm("");
    setPastedPaths("");
    setPatternDescription("");
    setTitleRegex("");
    setContentRegex("");
    setPrompt("");
    setTokenCount(0);
    setHasUnsavedChanges(false);
    setSessionInitialized(false);
  }, []);

  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  // Add a new function to manage localStorage backups
  const getLocalStorageKeyForProject = (key: string) => {
    // Create a safe, project-specific localStorage key
    const safeProjDir = projectDirectory ? 
      encodeURIComponent(projectDirectory.replace(/[\/\\?%*:|"<>]/g, '_')).substring(0, 50) : 
      'default';
    return `form-backup-${safeProjDir}-${key}`;
  };

  // Add a save-to-localStorage function after the handleInteraction function
  const saveToLocalStorage = useCallback((key: string, value: string) => {
    if (!projectDirectory) return;
    
    try {
      const storageKey = getLocalStorageKeyForProject(key);
      localStorage.setItem(storageKey, value);
    } catch (error) {
      console.error(`[LocalStorage] Error saving ${key} to localStorage:`, error);
    }
  }, [projectDirectory]);

  // Add a function to restore from localStorage
  const restoreFromLocalStorage = useCallback((key: string, setter: (value: string) => void, currentValue: string) => {
    if (!projectDirectory) return false;
    
    try {
      const storageKey = getLocalStorageKeyForProject(key);
      const savedValue = localStorage.getItem(storageKey);
      
      if (savedValue && (!currentValue || currentValue !== savedValue)) {
        console.log(`[LocalStorage] Restoring ${key} from localStorage`);
        setter(savedValue);
        return true;
      }
    } catch (error) {
      console.error(`[LocalStorage] Error restoring ${key} from localStorage:`, error);
    }
    
    return false;
  }, [projectDirectory]);

  // Add localStorage backup to all form field change handlers
  const handleTaskChange = useCallback(async (value: string) => {
    // Always update local state immediately
    setTaskDescription(value);
    // Save to localStorage
    saveToLocalStorage('task-description', value);
    // Do not clear active session ID automatically on input change
    handleInteraction(); // Mark interaction
    
    try {
      // Immediately save task description to ensure it persists through hot reloads
      if (projectDirectory && repository && activeSessionId) {
        // First, get the current task-description from db as a backup
        const backupDescription = await repository.getCachedState(projectDirectory, 'task-description');
        
        // Save the new task description (no debouncing for this critical value)
        await repository.saveCachedState(projectDirectory, 'task-description', value);
        
        console.log('Task description saved directly to prevent loss during HMR');
      }
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
  }, [activeSessionId, projectDirectory, repository, handleInteraction, saveToLocalStorage]);

  // New handler specifically for transcribed text
  const handleTranscribedText = useCallback((text: string) => {
    // Insert at cursor position instead of replacing entire content
    if (taskDescriptionRef.current) {
      taskDescriptionRef.current.insertTextAtCursorPosition(text);
    } else {
      // Fallback: Append to the end if ref not available
      const newText = taskDescription + (taskDescription ? ' ' : '') + text;
      setTaskDescription(newText);
      // Also save to localStorage
      saveToLocalStorage('task-description', newText);
      handleInteraction();
    }
  }, [taskDescription, handleInteraction, saveToLocalStorage]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    saveToLocalStorage('search-term', value);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]); // Add saveToLocalStorage dependency

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
    saveToLocalStorage('pasted-paths', cleanedValue);
    handleInteraction(); // Mark interaction
  }, [cleanXmlTags, handleInteraction, saveToLocalStorage]); // Add saveToLocalStorage dependency

  // Handle path preview after being loaded from external source
  const handlePathsPreview = useCallback((paths: string[]) => {
    if (!paths || paths.length === 0) return;
    
    // Join paths into a single string with newlines
    const pathsText = paths.join('\n');
    
    // Update pastedPaths state
    setPastedPaths(pathsText);
    saveToLocalStorage('pasted-paths', pathsText);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]);

  const handlePatternDescriptionChange = useCallback((value: string) => {
    setPatternDescription(value);
    saveToLocalStorage('pattern-description', value);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]); // Add saveToLocalStorage dependency

  const handleTitleRegexChange = useCallback((value: string) => {
    setTitleRegex(value);
    saveToLocalStorage('title-regex', value);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]); // Add saveToLocalStorage dependency

  const handleContentRegexChange = useCallback((value: string) => {
    setContentRegex(value);
    saveToLocalStorage('content-regex', value);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]); // Add saveToLocalStorage dependency

  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    saveToLocalStorage('title-regex', "");
    saveToLocalStorage('content-regex', "");
    setContentRegexError(null);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]);

  const handleToggleRegexActive = useCallback(() => {
    const newValue = !isRegexActive;
    setIsRegexActive(newValue);
    saveToLocalStorage('is-regex-active', String(newValue));
    handleInteraction();
  }, [isRegexActive, handleInteraction, saveToLocalStorage]); // Added handleInteraction dependency

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
      // The getDiffPrompt now returns the XML prompt structure

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
    geminiXmlPath: null,
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
      if (projectDirectory && repository) {
        try {
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

  // Add this effect at the beginning of the component
  // Form initialization effect - runs once on mount
  useEffect(() => {
    console.log('[Form] Component mounted, initializing...');
    // Mark the form as mounted to allow other effects to run
    initializationRef.current.formMounted = true;
    
    return () => { // Keep cleanup function
      console.log('[Form] Component unmounting, cleaning up...');
      // Clear any pending timeouts or operations on unmount
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
      }
    };
  }, []);

  // Function to get the current state for saving a session
  const getCurrentSessionState = useCallback((): Omit<Session, "id" | "name" | "updatedAt"> => {
    const includedFiles = Object.values(allFilesMap)
      .filter(f => f.included && !f.forceExcluded) // Filter included files
      .map(f => f.path);

    // Get force excluded files
    const forceExcludedFiles = Object.values(allFilesMap)
      .filter(f => f.forceExcluded) // Filter force excluded files
      .map(f => f.path);
    
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
      forceExcludedFiles,
      // Add default values for required Gemini fields in Session type
      geminiStatus: 'idle' as const,
      geminiStartTime: null,
      geminiEndTime: null,
      geminiXmlPath: null,
      geminiStatusMessage: null,
      geminiTokensReceived: 0,
      geminiCharsReceived: 0,
      geminiLastUpdate: 0,
    };
  }, [
    projectDirectory, 
    taskDescription, 
    searchTerm, 
    pastedPaths, 
    patternDescription,
    titleRegex, 
    contentRegex, 
    isRegexActive, // Keep isRegexActive state
    allFilesMap, 
  ]);

  const handleGenerateRegex = useCallback(async () => {
    if (!patternDescription.trim()) {
      setRegexGenerationError("Please enter a pattern description first");
      return;
    }

    setIsGeneratingRegex(true);
    setRegexGenerationError("");

    try {
      // Get a simple directory tree to provide context for the AI
      let directoryTree = "";
      if (projectDirectory) {
        const filesArray = Object.keys(allFilesMap).slice(0, 100); // Limit to avoid token overuse
        directoryTree = filesArray.join("\n");
      }

      // Call the regex generation action
      const result = await generateRegexPatternsAction(patternDescription, directoryTree);
      
      if (result.isSuccess && result.data) {
        // Update regex patterns if generated successfully
        if (result.data.titleRegex !== undefined) {
          setTitleRegex(result.data.titleRegex);
          saveToLocalStorage('title-regex', result.data.titleRegex);
        }
        if (result.data.contentRegex !== undefined) {
          setContentRegex(result.data.contentRegex);
          saveToLocalStorage('content-regex', result.data.contentRegex);
        }
      } else {
        setRegexGenerationError(result.message || "Failed to generate regex patterns");
      }
    } catch (error) {
      console.error("Error generating regex:", error);
      setRegexGenerationError(error instanceof Error ? error.message : "Unknown error occurred");
    } finally {
      setIsGeneratingRegex(false);
      handleInteraction();
    }
  }, [patternDescription, projectDirectory, allFilesMap, saveToLocalStorage, handleInteraction]);

  // Handle changes to the file map (selection status)
  const handleFilesMapChange = useCallback((updatedFilesMap: FilesMap) => {
    setAllFilesMapWithTracking(updatedFilesMap);
    handleInteraction();
  }, [setAllFilesMapWithTracking, handleInteraction]);

  // Handle adding a path to the pasted paths
  const handleAddPathToPastedPaths = useCallback((path: string) => {
    if (!path) return;
    
    // Add path to existing pasted paths
    const updatedPaths = pastedPaths ? 
      `${pastedPaths}\n${path}` : 
      path;
    
    setPastedPaths(updatedPaths);
    saveToLocalStorage('pasted-paths', updatedPaths);
    handleInteraction();
  }, [pastedPaths, handleInteraction, saveToLocalStorage]);

  // Handle finding relevant files based on task description
  const handleFindRelevantFiles = useCallback(async () => {
    if (!taskDescription.trim() || !projectDirectory) {
      return;
    }

    setIsFindingFiles(true);
    setError("");

    try {
      const result = await findRelevantFilesAction(projectDirectory, taskDescription);
      
      if (result.isSuccess && result.data) {
        // Update pastedPaths with the suggested relevant files
        const relevantPaths = result.data.relevantPaths;
        if (relevantPaths.length > 0) {
          const pathsText = relevantPaths.join('\n');
          setPastedPaths(pathsText);
          saveToLocalStorage('pasted-paths', pathsText);
        }
        
        // If there's enhanced task description, append it to the existing task description
        if (result.data.enhancedTaskDescription) {
          const updatedTaskDescription = `${taskDescription}\n\n${result.data.enhancedTaskDescription}`;
          setTaskDescription(updatedTaskDescription);
          saveToLocalStorage('task-description', updatedTaskDescription);
        }
        
        handleInteraction();
      } else {
        setError(result.message || "Failed to find relevant files");
      }
    } catch (error) {
      console.error("Error finding relevant files:", error);
      setError(error instanceof Error ? error.message : "Unknown error occurred");
    } finally {
      setIsFindingFiles(false);
    }
  }, [taskDescription, projectDirectory, handleInteraction, saveToLocalStorage]);

  return (
    <div className="flex flex-col flex-1 space-y-6"> {/* Removed padding */}
      <div className="grid grid-cols-1 gap-4">
        {/* Project Directory Selector - Always visible, handles its own loading/initialization */}
        {/* Removed the isInitialized check here as the selector should handle its own lifecycle */}
        {/* Pass the refresh handler and loading state */}

        <ProjectDirectorySelector onRefresh={handleRefreshFiles} isRefreshing={isRefreshingFiles} />
      
        {/* Session Manager - Now placed directly after Project Directory Selector */}
        <Suspense fallback={<div className="text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline-block mr-2"/>Loading session manager...</div>}>
          <SessionManager 
            projectDirectory={projectDirectory}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={handleLoadSession}
            activeSessionId={activeSessionId} // Pass active session ID
            setActiveSessionIdExternally={handleSetActiveSessionId}
            sessionInitialized={sessionInitialized} // Pass sessionInitialized status
            onSessionStatusChange={(hasSession: boolean) => setSessionInitialized(hasSession)}
            onSessionNameChange={(name: string) => {}} // No longer need to manage session name here
            onActiveSessionIdChange={handleSetActiveSessionId} // Pass the handler
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
        <Suspense fallback={<div className="h-[300px] flex items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2"/>Loading session...</div>}>
          <SessionGuard
            activeSessionId={activeSessionId}
            setActiveSessionId={handleSetActiveSessionId}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={handleLoadSession}
            sessionInitialized={sessionInitialized} // Pass sessionInitialized status
          >
            {/* FormStateManager handles auto-saving form state */}
            <FormStateManager // Wrap form elements inside FormStateManager
              sessionLoaded={sessionInitialized} // Pass session initialized status
              activeSessionId={activeSessionId}
              projectDirectory={projectDirectory || ""} 
              formState={formStateForManager} // Pass the explicitly constructed state
              onStateChange={setHasUnsavedChanges} // Use setHasUnsavedChanges directly
              isSaving={isFormSaving}
              onSaveError={setSessionSaveError}
            >
              {/* Task Description with Voice Transcription */}
              <div className="flex flex-col w-full gap-4">
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
                projectDirectory={projectDirectory}
                onInteraction={handleInteraction}
                onParsePaths={handlePathsPreview}
                warnings={externalPathWarnings}
                canCorrectPaths={!!projectDirectory}
                isFindingFiles={isFindingFiles}
                canFindFiles={!!taskDescription.trim() && !!projectDirectory}
                onFindRelevantFiles={handleFindRelevantFiles}
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

              {projectDataLoading && (
                <div className="bg-primary/10 p-4 rounded-lg mb-4 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <p className="text-primary font-medium">Loading project data...</p>
                </div>
              )}

              {prompt && !isLoading && ( // Only show prompt preview when not loading
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
                  <pre className="bg-background p-4 rounded-md overflow-auto whitespace-pre-wrap text-xs max-h-[650px]"> {/* Reduced font size for dense prompt */}
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
        {activeSessionId && projectDirectory && sessionInitialized && prompt && ( // Render Gemini controls only when session is active, initialized, AND a prompt has been generated
            <Suspense fallback={<div>Loading Gemini Processor...</div>}>
              <GeminiProcessor prompt={prompt} activeSessionId={activeSessionId} />
            </Suspense>
        )}
      </div>
    </div>
  );
}
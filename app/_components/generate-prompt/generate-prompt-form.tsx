"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { readDirectoryAction, readExternalFileAction, invalidateDirectoryCache } from "@/actions/read-directory-actions"; // Keep read-directory-actions import
import { findRelevantFilesAction } from "@/actions/path-finder-actions"; // Import the new action
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
import { Loader2, Search, Wand2 } from "lucide-react"; // Add Wand2 for AI button
import { cn } from "@/lib/utils";
import { invalidateFileCache } from '@/lib/git-utils';
import { Button } from "@/components/ui/button";
import { generateDirectoryTree } from "@/lib/directory-tree"; // Import directory tree generator

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
  // URL handling
  const router = useRouter(); // Keep useRouter
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Ref to control initial loading and prevent loops
  const initializationRef = useRef({
    initialized: false,
    projectInitialized: false
  }); // Track initialization status

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
  }, []); // No dependencies needed here, it's just setting state

  // Load files function with debounce
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
      setIsLoadingFiles(true);
      setLoadingStatus("Refreshing files from git repository...");
    }
    
    // Clear error state
    setError("");
    
    try {
      // For initial load, check for cached file selections *before* fetching files
      let initialIncludedSet = new Set<string>();
      let initialExcludedSet = new Set<string>();      
      // Save existing selections ONLY if refreshing
      const existingSelections = isRefresh ? new Map(
        Object.entries(allFilesMap).map(([path, info]) => [path, {
          included: info.included,
          forceExcluded: info.forceExcluded
        }])
      ) : null;

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
          const normalizedPath = normalizePath(path);
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

        if (isRefresh && existingSelections?.has(path)) {
          const existing = existingSelections.get(path)!;
          included = existing.included;
          // Only preserve forceExcluded if it was explicitly set
          forceExcluded = existing.forceExcluded;
        } else {
          // Otherwise use cached selections or default
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
      setAllFilesMap(newFilesMap);
      
      console.log(`[${isRefresh ? 'Refresh' : 'Load'}] Processed ${Object.keys(newFilesMap).length} files from git repository.`);
    } catch (error) {
      console.error(`Error ${isRefresh ? 'refreshing' : 'loading'} files:`, error);
      setError(`Failed to ${isRefresh ? 'refresh' : 'load'} files: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingFiles(false);
      setLoadingStatus("");
      setIsRefreshingFiles(false); // Ensure refresh state is reset
      handleInteraction(); // Trigger save check after files are loaded/refreshed
      loadFilesRef.current.isLoading = false; // Mark as no longer loading
    } 
  }, []);  // Remove dependencies to prevent recreating the function
  
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
      setLoadingStatus("");
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
      initializationRef.current.projectInitialized = false;
      setIsRestoringSession(true); // Indicate session restore attempt

      try {
        // If the project directory changed, clear the active session first
        // Only clear if the new initialDir is different from the *previous* context projectDir
        if (initialDir !== projectDirectory) handleSetActiveSessionId(null);
        setSessionInitialized(false); // Reset initialization status for this load
        console.log(`[Form Init] Initializing for ${dirToLoad}`);

        const savedActiveSessionId = await repository.getActiveSessionId(dirToLoad);
        
        if (savedActiveSessionId) {
          console.log(`[Form Init] Found active session ID in DB: ${savedActiveSessionId}. SessionManager will load it.`);
          // Load files first
          await handleLoadFiles(dirToLoad, false);
          // SessionManager's useEffect will load the session data after this.
        } else {
          console.log(`[Form Init] No active session found in DB for this project.`);
          // Load files even if no session exists, user might want to create one
          await handleLoadFiles(dirToLoad, false);
        }

        // Mark initialization as complete
        initializationRef.current.projectInitialized = true;
      } catch (error) {
        console.error("Error initializing project data:", error);
        setError(`Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`);
        // Reset initialization flag on error to allow retry
        initializationRef.current.projectInitialized = false;
        setSessionInitialized(false);
      } finally {
        setIsRestoringSession(false); // Finished attempt
      }
    };
    
    // Only run initialization if project changed or not yet initialized for this project, and not currently loading files
    if (projectDirectory && projectDirectory !== loadFilesRef.current.lastDirectory && !isLoadingFiles) {
      initializeProjectData(initialDir);
      handleInteraction(); // Indicate interaction after initialization attempt
    }
  }, [projectDirectory, repository, handleLoadFiles, searchParams, handleSetActiveSessionId]);

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

  const handlePastedPathsChange = useCallback((value: string) => { // Keep useCallback
    setPastedPaths(value);
    handleInteraction();
  }, [handleInteraction]); // Add handleInteraction dependency

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
    setLoadingStatus("Loading ALL project files...");
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
      console.log(`Loaded ${projectFilePaths.length} files from project`);
      
      // Then find relevant files
      setLoadingStatus("Analyzing codebase and finding relevant files...");
      const result = await findRelevantFilesAction(
        projectDirectory, 
        taskDescription
      );

      if (result.isSuccess && result.data?.relevantPaths) {
        const relevantPaths = result.data.relevantPaths;
        setPastedPaths(relevantPaths.join('\n'));
        
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
  }, [taskDescription, projectDirectory, handleInteraction, taskDescriptionRef]);

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
      // No codebase structure, always use empty structure
      instructions = instructions
        .replace("{{STRUCTURE_SECTION}", "")
        .replace(/(\d+)\./g, (match, num) => {
          const section = parseInt(num);
          return section > 2 ? `${section - 1}.` : `${section}.`;
        }); // End replace call

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
  const showLoadingOverlay = isLoadingFiles || isRestoringSession || isRefreshingFiles;
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
                value={pastedPaths} 
                onChange={handlePastedPathsChange}
                projectDirectory={projectDirectory}
                warnings={externalPathWarnings} // Pass warnings
                onFindRelevantFiles={handleFindRelevantFiles} // Pass the new handler
                isFindingFiles={isFindingFiles} // Pass loading state
                canFindFiles={!!taskDescription.trim() && !!projectDirectory} // Only check task description and project directory
              >
                {/* Add the button here */}
                <Button
                    type="button"
                    variant="secondary" // Change variant for more prominence
                    size="sm"
                    onClick={handleFindRelevantFiles}
                    disabled={isFindingFiles || !taskDescription.trim() || !projectDirectory}
                    className="mt-2"
                    title={!taskDescription.trim() ? "Enter a task description first" : 
                           !projectDirectory ? "Select a project directory first" :
                           "Analyze codebase structure to find relevant files and enhance your task description with helpful context"}
                ><Wand2 className="h-4 w-4 mr-2" />{isFindingFiles ? "Analyzing Codebase..." : "Analyze Codebase & Find Relevant Files"}</Button>
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
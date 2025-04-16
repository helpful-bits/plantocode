"use client";

import React, { useEffect, useState, useMemo, useCallback, Suspense, useRef } from "react";
import { readDirectoryAction, readExternalFileAction } from "@/actions/read-directory-actions";
import { Button } from "@/components/ui/button";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { estimateTokens } from "@/lib/token-estimator";
import { getFormatInstructions } from "@/lib/format-instructions";
import CodebaseStructure from "./_components/codebase-structure";
import ProjectDirectorySelector from "./_components/project-directory-selector";
import { useProject } from "@/lib/contexts/project-context";
import { useFormat } from "@/lib/contexts/format-context";
import { useDatabase } from "@/lib/contexts/database-context";
import { normalizePath, formatPathForDisplay } from "@/lib/path-utils";
import FileBrowser from "./file-browser";
import RegexInput from "./_components/regex-input"; // Keep RegexInput import
import PastePaths from "./paste-paths";
import path from "path";
import TaskDescriptionArea, { TaskDescriptionHandle } from "./_components/task-description"; // Keep TaskDescriptionHandle import
import VoiceTranscription from "./_components/voice-transcription";
import { OutputFormat, Session } from "@/types";
import { Input } from "@/components/ui/input";
import { GeminiProcessor } from '@/app/_components/gemini-processor/gemini-processor'; // Import the new component
import { Loader2 } from "lucide-react"; // Keep Loader2 import
import { Info, ToggleLeft, ToggleRight, FileText, FolderClosed, AlertCircle, X } from "lucide-react"; // Added X import
import { cn } from "@/lib/utils";
import { useDebounceCallback } from 'usehooks-ts';

const TASK_DESC_KEY = "task-description";
const SEARCH_TERM_KEY = "search-term";
const PASTED_PATHS_KEY = "pasted-paths";
const INCLUDED_FILES_KEY = "included-files";
// Keys for cached state when NO session is active (these are being removed)
const FORCE_EXCLUDED_FILES_KEY = "force-excluded-files";
const CODEBASE_STRUCTURE_KEY = "codebase-structure";
const PATTERN_DESC_KEY = "pattern-desc";
const TITLE_REGEX_KEY = "title-regex";
const CONTENT_REGEX_KEY = "content-regex";
const REGEX_ACTIVE_KEY = "regex-active";
const CUSTOM_FORMAT_KEY = "custom-format"; // Added key for custom format

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
  const [codebaseStructure, setCodebaseStructure] = useState("");
  const { outputFormat, customFormat, setCustomFormat } = useFormat();
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [isRegexActive, setIsRegexActive] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false); // Keep debug mode state
  const [sessionName, setSessionName] = useState<string>(""); // Add state for session name
  const [pathDebugInfo, setPathDebugInfo] = useState<{ original: string, normalized: string }[]>([]);
  const saveTaskDebounceTimer = React.useRef<NodeJS.Timeout | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null); // State for auto-save errors
  const taskDescriptionRef = useRef<TaskDescriptionHandle>(null);
  const [isFormSaving, setIsFormSaving] = useState(false); // State to track if FormStateManager is saving - controlled by FormStateManager
  const [isRefreshingFiles, setIsRefreshingFiles] = useState(false); // Add state for refresh operation

  // Ref to control initial loading and prevent loops
  const initializationRef = useRef({
    initialized: false,
    projectInitialized: false
  });

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
    setTokenCount(count);
  }, []);

  // Function to save active session ID
  const handleSetActiveSessionId = useCallback(async (sessionId: string | null) => { // Make async
    console.log(`[Form] Setting active session ID internally: ${sessionId}`);
    setActiveSessionId(sessionId);
    setSessionInitialized(!!sessionId); // Update initialized status based on whether sessionId exists
    if (!sessionId) setSessionName(""); // Clear name if session is deactivated
    setSessionSaveError(null); // Clear save error when session changes
    if (projectDirectory && outputFormat && repository) await repository.setActiveSession(projectDirectory, outputFormat, sessionId); // Await and check dependencies
  }, [projectDirectory, outputFormat, repository]);

  // Modify handleLoadFiles to accept a refresh parameter
  const handleLoadFiles = useCallback(async (directory: string, isRefresh = false) => {
      if (!directory || isLoadingFiles || isRefreshingFiles) return; // Prevent concurrent loads and while refreshing

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

      
      if (!isRefresh) {
        // When loading for the first time (not refresh), DO NOT load cached file selections.
        // The active session (if any) will be loaded by SessionManager, which includes selections.
        // If no active session, default selections will be applied.
        console.log("[Load Files] Initial load: Skipping cached file selections. Session state will be loaded if active.");
      }

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
      setAllFilesMap(newFilesMap);
      
      console.log(`[${isRefresh ? 'Refresh' : 'Load'}] Processed ${Object.keys(newFilesMap).length} files from git repository.`);
    } catch (error) {
      console.error(`Error ${isRefresh ? 'refreshing' : 'loading'} files:`, error);
      setError(`Failed to ${isRefresh ? 'refresh' : 'load'} files: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoadingFiles(false);
      setLoadingStatus("");
      setIsRefreshingFiles(false); // Ensure refresh state is reset
    }
  }, [repository, outputFormat, allFilesMap, isLoadingFiles, isRefreshingFiles]); // Added isRefreshingFiles

  const handleRefreshFiles = useCallback(async () => {
    if (!projectDirectory || isLoadingFiles || isRefreshingFiles) return;
    
    console.log(`[Refresh] Starting file refresh operation for ${projectDirectory}`);
    setIsRefreshingFiles(true);
    setLoadingStatus("Refreshing files from git repository...");
    
    try {
      repository.clearCache(); // Clear client-side cache before manual refresh
      await handleLoadFiles(projectDirectory, true); // Pass true to indicate refresh
      console.log(`[Refresh] Successfully refreshed files for ${projectDirectory}`);
    } catch (error) {
      console.error("[Refresh] Error refreshing files:", error);
      setError(`Failed to refresh files: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Ensure the refresh state is reset
      // setIsLoadingFiles and setLoadingStatus are handled within handleLoadFiles
      setLoadingStatus("");
    }
  }, [projectDirectory, isLoadingFiles, isRefreshingFiles, handleLoadFiles, repository]);

  // Load initial data when project directory or format changes
  useEffect(() => {
    if (!projectDirectory || !outputFormat || !repository || initializationRef.current.projectInitialized) {
      return;
    }
    
    if (!projectDirectory || !outputFormat || !repository) {
      // Clear state if no project directory or format
      setAllFilesMap({});
      setFileContentsMap({});
      setActiveSessionId(null);
      setSessionInitialized(false);
      return;
    }

    console.log(`[Form Init] Project/Format changed: ${projectDirectory} / ${outputFormat}. Initializing...`);
    
    const initializeProjectData = async () => {
      initializationRef.current.projectInitialized = false; // Reset flag before starting
      setIsRestoringSession(true); // Indicate session restore attempt

      try {
        setActiveSessionId(null); // Clear current session FIRST
        setSessionInitialized(false); // Reset initialization status
        console.log(`[Form Init] Initializing for ${projectDirectory}/${outputFormat}`);

        const savedActiveSessionId = await repository.getActiveSessionId(projectDirectory, outputFormat);
        
        if (savedActiveSessionId) {
          console.log(`[Form Init] Found active session ID in DB: ${savedActiveSessionId}. SessionManager will load it.`);
          // Don't set activeSessionId here directly. Let SessionManager handle loading.
          // Files will be loaded by handleLoadFiles, which will be triggered by project/format change.
          await handleLoadFiles(projectDirectory, false); // Load files first
          // SessionManager's useEffect will load the session data after this.
        } else {
          console.log("[Form Init] No active session found in DB for this project/format.");
          await handleLoadFiles(projectDirectory, false); // Explicitly false for initial load
        }

        // Mark initialization as complete *after* loading attempt
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
    
    // Don't run initialization if already initialized for this project/format
    initializeProjectData();
  }, [projectDirectory, outputFormat, repository, handleLoadFiles]); // Removed loadCachedStates dependency

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
    
    if (saveTaskDebounceTimer.current) {
      clearTimeout(saveTaskDebounceTimer.current);
    }
    
    saveTaskDebounceTimer.current = setTimeout(async () => {
      // Immediately save the task description to the database
      if (projectDirectory && outputFormat) {
        try {
          // If a session is active, save to the session, otherwise save to cache
          if (activeSessionId) {
            // Get the current session data first
            const currentSession = await repository.getSession(activeSessionId);
            
            if (currentSession) {
              
              const updatedSession: Session = { 
                ...currentSession, 
                taskDescription: value, 
                updatedAt: Date.now() 
              };
              
              // Verify required fields are present
              if (!updatedSession.id || !updatedSession.name || !updatedSession.projectDirectory || !updatedSession.outputFormat) {
                console.error("Missing required session fields:", {
                  id: updatedSession.id,
                  name: updatedSession.name,
                  projectDirectory: updatedSession.projectDirectory,
                  outputFormat: updatedSession.outputFormat
                });
                throw new Error("Session missing required fields");
              }
              
              await repository.saveSession(updatedSession);
              console.log(`Successfully saved task description to active session ${activeSessionId}`);
            } else {
              console.error(`Session ${activeSessionId} not found when trying to update task description`);
              setError(`Failed to save task description: Session not found`);
              // Consider resetting the active session ID since it's invalid
              setActiveSessionId(null);
            }
          } else {
            // Don't save to cache if no session is active - FormStateManager handles this
            // await repository.saveCachedState(projectDirectory, outputFormat, TASK_DESC_KEY, value);
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
          }, 5000);
        }
      }
    }, 5000); // Set timeout duration explicitly
  }, [activeSessionId, projectDirectory, outputFormat, repository, setActiveSessionId, handleInteraction, setError]);

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
      return;
    }

    setIsGeneratingRegex(true);
    setRegexGenerationError(""); // Clear previous errors
    try {
      console.log("Generating regex patterns for:", patternDescription);
      const result = await generateRegexPatternsAction(patternDescription, codebaseStructure || undefined);
      console.log("Regex generation result:", result);
      
      if (result.isSuccess && result.data) {
        const newTitleRegex = result.data.titleRegex || "";
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
  }, [patternDescription, codebaseStructure, handleInteraction]); // Added handleInteraction

  const handleCodebaseStructureChange = useCallback((value: string) => {
    setCodebaseStructure(value);
    handleInteraction(); // Mark interaction
  }, []);

  // Update allFilesMap state from child components
  const handleFilesMapChange = useCallback((newMap: FilesMap) => { // Keep useCallback
    setAllFilesMap(newMap);
    handleInteraction(); // Mark interaction
  }, []);

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
      
      if (projectDirectory) {
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
        }
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

      let instructions = await getFormatInstructions(outputFormat, customFormat);

      if (outputFormat === "refactoring") {
        if (codebaseStructure.trim()) { // Only add structure if it exists
          const structureSection = `<structure>
${codebaseStructure}
</structure>`;
          instructions = instructions.replace("{{STRUCTURE_SECTION}", structureSection);
        } else {
          instructions = instructions
            .replace("{{STRUCTURE_SECTION}", "")
            .replace(/(\d+)\./g, (match, num) => {
              const section = parseInt(num);
              return section > 2 ? `${section - 1}.` : `${section}.`;
            });
        }
      }

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
      
    // Find the current session data to get existing Gemini status
    // This might be slightly delayed, but FormStateManager should handle the actual merging
    // const activeSession = activeSessionId ? allFilesMap[activeSessionId] : null; // Example placeholder, needs real fetch if complex

    // Get force excluded files
    const forceExcludedFiles = Object.values(allFilesMap)
      .filter(f => f.forceExcluded) // Filter force excluded files
      .map(f => f.path);
    
    // Add geminiStatus and other required fields with empty default values
    return {
      projectDirectory,
      taskDescription,
      searchTerm,
      pastedPaths,
      patternDescription,
      titleRegex,
      contentRegex,
      isRegexActive,
      codebaseStructure,
      includedFiles,
      forceExcludedFiles, // Add forceExcludedFiles
      outputFormat, // Include outputFormat
      customFormat: customFormat || "", // Ensure customFormat is included, default to empty string
      // Add default values for required fields in Session type
      geminiStatus: 'idle' as const, // Default Gemini fields for state object with explicit type
      geminiStartTime: null,
      geminiEndTime: null,
      geminiPatchPath: null,
      geminiStatusMessage: null,
      geminiTokensReceived: 0, // Add default for new fields
      geminiCharsReceived: 0,
      geminiLastUpdate: 0, // Changed from null to 0 to match expected type
    };
  }, [
    projectDirectory, 
    taskDescription, 
    searchTerm, 
    pastedPaths, 
    patternDescription, 
    titleRegex, 
    contentRegex, 
    isRegexActive, 
    codebaseStructure, 
    allFilesMap, 
    outputFormat, // Added outputFormat
    customFormat // Add customFormat dependency
  ]);


  // Load session handler
  const handleLoadSession = useCallback((session: Session) => {
    console.log(`Loading session: ${session.name} (${session.id})`);
    setTaskDescription(session.taskDescription || "");
    setSessionName(session.name); // Set session name state
    setProjectDirectory(session.projectDirectory); // Ensure project directory is also loaded
    setSearchTerm(session.searchTerm || "");
    setPastedPaths(session.pastedPaths || "");
    setPatternDescription(session.patternDescription || "");
    setTitleRegex(session.titleRegex || "");
    setContentRegex(session.contentRegex || "");
    setCodebaseStructure(session.codebaseStructure || "");
    setCustomFormat(session.customFormat || ""); // Load custom format
    setIsRegexActive(session.isRegexActive);
    
    // Apply file selections from the loaded session
    // Handle included/excluded files if they exist
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
        }
      });
      
      // Mark force excluded files
      if (session.forceExcludedFiles) {
        session.forceExcludedFiles.forEach(filePath => {
          if (updatedFilesMap[filePath]) {
            updatedFilesMap[filePath].forceExcluded = true;
            updatedFilesMap[filePath].included = false; // Ensure included is false if forceExcluded
          }
        });
      }
      
      // Update state
      setAllFilesMap(updatedFilesMap);
    }
    // IMPORTANT: Do NOT load session.geminiStatus, geminiStartTime, etc. here.
    // The GeminiProcessor component fetches this directly via polling.
    // Loading it here would create race conditions and overwrite the live status.
    setHasUnsavedChanges(false); // Mark as saved state initially
    setSessionInitialized(true);
    // Do not set initializationRef.current.sessionRestoreAttempted = true here
    console.log(`[Form] Session ${session.id} loaded into form state.`);
  }, [allFilesMap, setCustomFormat, setProjectDirectory]); // Added setProjectDirectory dependency

  const formStateForManager = useMemo(() => {
        const includedFiles = Object.values(allFilesMap)
            .filter(f => f.included && !f.forceExcluded)
            .map(f => f.path);
        const forceExcludedFiles = Object.values(allFilesMap)
            .filter(f => f.forceExcluded)
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
            codebaseStructure,
            includedFiles,
            forceExcludedFiles,
            outputFormat,
            customFormat: customFormat || "",
            // Add required Gemini fields with default values
            geminiStatus: 'idle' as const, // These are just placeholders for the type, actual values come from DB
            geminiStartTime: null,
            geminiEndTime: null,
            geminiPatchPath: null,
            geminiStatusMessage: null,
            geminiTokensReceived: 0, // Add default for new fields
            geminiCharsReceived: 0,
            geminiLastUpdate: null,
        };
    }, [
        projectDirectory, taskDescription, searchTerm, pastedPaths, patternDescription,
        titleRegex, contentRegex, isRegexActive, codebaseStructure, allFilesMap,
        outputFormat, customFormat
    ]);

  // Reset initialization flag when project directory changes
  useEffect(() => {
    initializationRef.current.projectInitialized = false;
  }, [projectDirectory]);

  const showLoadingOverlay = isLoadingFiles || isRestoringSession || isRefreshingFiles;
  return (
    <div className="flex flex-col flex-1 space-y-6"> {/* Removed padding */}
      <div className="grid grid-cols-1 gap-4">
        {/* Project Directory Selector - Always visible */}
        <ProjectDirectorySelector onRefresh={handleRefreshFiles} />
      
        {/* Session Manager - Now placed directly after Project Directory Selector */}
        <Suspense fallback={<div>Loading session manager...</div>}>
          <SessionManager
            projectDirectory={projectDirectory}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={handleLoadSession}
            outputFormat={outputFormat}
            activeSessionId={activeSessionId}
            onSessionNameChange={setSessionName} // Pass setter for session name
            setActiveSessionIdExternally={handleSetActiveSessionId}
            sessionInitialized={sessionInitialized} // Pass sessionInitialized status
            onSessionStatusChange={(hasSession: boolean) => setSessionInitialized(hasSession)}
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
              sessionName={sessionName}
              activeSessionId={activeSessionId}
              projectDirectory={projectDirectory || ""}
              outputFormat={outputFormat}
              formState={formStateForManager} // Pass the explicitly constructed state // Pass the explicitly constructed state
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
                  codebaseStructure={codebaseStructure} 
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
              />

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
                <div className="bg-muted p-4 rounded-md mt-6 relative">
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
        {!activeSessionId && projectDirectory && outputFormat && !showLoadingOverlay && (
          <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md">
            Select a project directory and output format to begin. Create a new session or load an existing one.
          </div>
        )}

        {/* Gemini Processor Section - Render it outside the SessionGuard/FormStateManager */}
        {activeSessionId && projectDirectory && outputFormat && sessionInitialized && ( // Render Gemini controls only when session is fully active and initialized
            <Suspense fallback={<div>Loading Gemini Processor...</div>}>
              <GeminiProcessor prompt={prompt} activeSessionId={activeSessionId} />
            </Suspense>
        )}
      </div>
    </div>
  );
}
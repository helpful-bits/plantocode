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
import { Session } from "@/types/session-types";
import { normalizePath, formatPathForDisplay } from "@/lib/path-utils";
import FileBrowser from "./file-browser";
import RegexInput from "./_components/regex-input";
import PastePaths from "./paste-paths";
import path from "path";
import TaskDescriptionArea, { TaskDescriptionHandle } from "./_components/task-description";
import VoiceTranscription from "./voice-transcription";
import { OutputFormat } from "@/types";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const TASK_DESC_KEY = "task-description";
const SEARCH_TERM_KEY = "search-term";
const PASTED_PATHS_KEY = "pasted-paths";
const INCLUDED_FILES_KEY = "included-files";
const FORCE_EXCLUDED_FILES_KEY = "force-excluded-files";
const CODEBASE_STRUCTURE_KEY = "codebase-structure";
const PATTERN_DESC_KEY = "pattern-desc";
const TITLE_REGEX_KEY = "title-regex";
const CONTENT_REGEX_KEY = "content-regex";
const REGEX_ACTIVE_KEY = "regex-active";
const ACTIVE_SESSION_KEY = "active-session-id";

// Fix the lazy imports with proper dynamic import syntax
const SessionManager = React.lazy(() => import("./_components/session-manager"));
const SessionGuard = React.lazy(() => import("./_components/session-guard"));
const FormStateManager = React.lazy(() => import("./_components/form-state-manager"));
const PatternDescriptionInput = React.lazy(() => import("./_components/pattern-description-input"));

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
  const [pastedPathsFound, setPastedPathsFound] = useState(0);
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [codebaseStructure, setCodebaseStructure] = useState("");
  const { outputFormat, customFormat, setCustomFormat } = useFormat();
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [isRegexActive, setIsRegexActive] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [pathDebugInfo, setPathDebugInfo] = useState<{ original: string, normalized: string }[]>([]);
  const [sessionRestoreAttempted, setSessionRestoreAttempted] = useState(false);
  const saveTaskDebounceTimer = React.useRef<NodeJS.Timeout | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null); // State for auto-save errors
  const taskDescriptionRef = useRef<TaskDescriptionHandle>(null);

  // Define the handleInteraction function to mark form interactions
  const handleInteraction = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  // Function to estimate token count
  const updateTokenCount = useCallback(async (text: string) => {
    const count = await estimateTokens(text);
    setTokenCount(count);
  }, []);

  // UseEffect to check for Anthropic key on mount
  useEffect(() => {
    // Removing the entire checkAnthropicKey function and its call
  }, []);

  // Function to save active session ID
  const handleSetActiveSessionId = useCallback((sessionId: string | null) => {
    console.log(`[Form] Setting active session ID internally: ${sessionId}`);
    setActiveSessionId(sessionId);
    setSessionSaveError(null); // Clear save error when session changes
    setSessionInitialized(!!sessionId); // Update initialized status
    repository.setActiveSession(projectDirectory, outputFormat, sessionId);
  }, [projectDirectory, outputFormat, repository]);

  // Load cached states from database (only called if no active session)
  const loadCachedStates = useCallback(async (dir: string, format: OutputFormat) => { // Use OutputFormat type
    console.log(`[Load State] Loading cached state for ${dir}/${format}`);
    const cachedTask = await repository.getCachedState(dir, format, TASK_DESC_KEY) ?? "";
    const cachedSearch = await repository.getCachedState(dir, format, SEARCH_TERM_KEY) ?? "";
    const cachedPaths = await repository.getCachedState(dir, format, PASTED_PATHS_KEY) ?? "";
    const cachedStructure = await repository.getCachedState(dir, format, CODEBASE_STRUCTURE_KEY) ?? "";
    const cachedPatternDesc = await repository.getCachedState(dir, format, PATTERN_DESC_KEY);
    const cachedTitleRegex = await repository.getCachedState(dir, format, TITLE_REGEX_KEY);
    const cachedContentRegex = await repository.getCachedState(dir, format, CONTENT_REGEX_KEY);
    // ... etc.
    console.log(`[Load State] Loaded Task: ${cachedTask ? 'Yes' : 'No'}, Search: ${cachedSearch ? 'Yes' : 'No'}, ...`);
    if (cachedTask) setTaskDescription(cachedTask);
    if (cachedSearch) setSearchTerm(cachedSearch);
    if (cachedPaths) setPastedPaths(cachedPaths);
    if (cachedStructure) setCodebaseStructure(cachedStructure);
    if (cachedPatternDesc) setPatternDescription(cachedPatternDesc);
    if (cachedTitleRegex) setTitleRegex(cachedTitleRegex);
    if (cachedContentRegex) setContentRegex(cachedContentRegex);

    // Load customFormat
    const savedRegexActive = await repository.getCachedState(dir, format, REGEX_ACTIVE_KEY);
    setIsRegexActive(savedRegexActive === null ? true : savedRegexActive === "true");
      console.log(`[Load State] Regex Active: ${isRegexActive}`);
    // Don't reset active session ID here, as we want to potentially restore it
  }, [repository]); // Removed state setters from dependency array

  useEffect(() => {
    const saveAllStates = async () => {
      try {
        // Handle each save operation separately to avoid single failure causing all to fail
        const saveOperations = [
          repository.saveCachedState(projectDirectory, outputFormat, TASK_DESC_KEY, taskDescription).catch(err => {
            console.error(`Error saving task description:`, err);
            return null;
          }),
          repository.saveCachedState(projectDirectory, outputFormat, SEARCH_TERM_KEY, searchTerm).catch(err => {
            console.error(`Error saving search term:`, err);
            return null;
          }),
          repository.saveCachedState(projectDirectory, outputFormat, PASTED_PATHS_KEY, pastedPaths).catch(err => {
            console.error(`Error saving pasted paths:`, err);
            return null;
          }),
          repository.saveCachedState(projectDirectory, outputFormat, PATTERN_DESC_KEY, patternDescription).catch(err => {
            console.error(`Error saving pattern description:`, err);
            return null;
          }),
          repository.saveCachedState(projectDirectory, outputFormat, TITLE_REGEX_KEY, titleRegex).catch(err => {
            console.error(`Error saving title regex:`, err);
            return null;
          }),
          repository.saveCachedState(projectDirectory, outputFormat, CONTENT_REGEX_KEY, contentRegex).catch(err => {
            console.error(`Error saving content regex:`, err);
            return null;
          }),
          repository.saveCachedState(projectDirectory, outputFormat, CODEBASE_STRUCTURE_KEY, codebaseStructure).catch(err => {
            console.error(`Error saving codebase structure:`, err);
            return null;
          }),
          repository.saveCachedState(projectDirectory, outputFormat, REGEX_ACTIVE_KEY, String(isRegexActive)).catch(err => {
            console.error(`Error saving regex active state:`, err);
            return null;
          }),
          repository.saveCachedState(projectDirectory, outputFormat, CUSTOM_FORMAT_KEY, customFormat).catch(err => {
              console.error(`Error saving custom format state:`, err);
              return null;
          }),
        ];
        
        await Promise.all(saveOperations);
        
        // Log success only if all operations succeeded
        if (!saveOperations.some(op => op === null)) {
          // console.log("Successfully saved all cached state items"); // Reduce noise
        }
      } catch (error) {
        console.error("Error in saveAllStates:", error);
      }
    };
    
    // Trigger saving only if projectDirectory and outputFormat are set
    if (!projectDirectory || !outputFormat) {
      return;
    }

    // Debounce state saving to reduce database writes
    const timerId = setTimeout(async () => { // Added async
      // Only save to cache if NO session is active
      if (!activeSessionId) {
        // saveAllStates(); // Debounced save call
      }
    }, 750); // Debounce time slightly reduced
    
    return () => clearTimeout(timerId);
  }, [
      taskDescription, searchTerm, pastedPaths, patternDescription, titleRegex, contentRegex, codebaseStructure, isRegexActive, customFormat, projectDirectory, outputFormat, repository
  ]);

  // Save file selections whenever allFilesMap changes
  useEffect(() => {
    // Debounce file selection saving
    const timerId = setTimeout(async () => { // Added async keyword
      // Only proceed if projectDirectory and outputFormat are set
      if (projectDirectory && outputFormat && Object.keys(allFilesMap).length > 0) {
        // Extract the lists based on the current state of allFilesMap
        const includedPaths = Object.values(allFilesMap)
          .filter(f => f.included && !f.forceExcluded) // Save only included and not forced excluded
          .map(f => f.path);
        const excludedPaths = Object.values(allFilesMap)
          .filter(f => f.forceExcluded) // Save all that are currently checked as forceExcluded
          .map(f => f.path); // Added missing semicolon

        try {
          if (activeSessionId) {
            console.log(`Active session (${activeSessionId}): Updating session file selections in DB.`);
            // Fetch the session data to ensure we have the latest full state
            const currentSession = await repository.getSession(activeSessionId); // Fetch session data

            if (currentSession) {
              // Create the updated session object, preserving existing fields and updating file lists
              const updatedSession: Session = {
                ...currentSession, // Preserve all existing fields
                includedFiles: includedPaths,
                forceExcludedFiles: excludedPaths,
                updatedAt: Date.now(), // Update timestamp - Important for ordering/tracking
              };
              // Save the modified session object back to the database
              await repository.saveSession(updatedSession);
              console.log(`Successfully updated session ${activeSessionId} file selections.`);
            } else {
              console.warn(`Active session ${activeSessionId} not found during file selection update. Cannot update session.`);
            }
          } else {
            console.log("No active session: Saving file selections to individual cache keys.");
             try {
               await Promise.all([
                 repository.saveCachedState(projectDirectory, outputFormat, INCLUDED_FILES_KEY, JSON.stringify(includedPaths)),
                 repository.saveCachedState(projectDirectory, outputFormat, FORCE_EXCLUDED_FILES_KEY, JSON.stringify(excludedPaths))
               ]);
               // console.log("Successfully saved file selections to cache."); // Reduce noise
             } catch (cacheSaveError) {
                console.error("Error saving file selections to cache:", cacheSaveError);
             }
          }
        } catch (error) {
          console.error("Error saving file selections:", error);
        }
      }
       else {
         // console.log("Skipping file selection save:", { projectDirectory, outputFormat, hasFiles: Object.keys(allFilesMap).length > 0 }); // Reduce noise
      }
    }, 750); // Increased debounce slightly

    return () => clearTimeout(timerId);

  // Dependencies for the effect hook
  }, [
      allFilesMap,          // Trigger effect when file selections change
      projectDirectory,     // Needed for context and repository calls
      activeSessionId,      // Crucial for deciding save logic
      repository,           // Needed for database operations
      outputFormat,         // Added outputFormat dependency
  ]);

  // Define handleLoadFiles before checkActiveSessionId useEffect
  const handleLoadFiles = useCallback(async (directory: string) => {
    if (!directory?.trim()) {
      console.log("No directory provided, skipping file load");
      return;
    }
    
    // Clear existing files and any errors
    setAllFilesMap({});
    setFileContentsMap({});
    setError("");
    
    setIsLoadingFiles(true);
    setLoadingStatus("Reading git repository...");
    
    try {
      // Get previously cached file selections if they exist
      const cachedIncluded = await repository.getCachedState(directory, outputFormat, INCLUDED_FILES_KEY);
      const cachedExcluded = await repository.getCachedState(directory, outputFormat, FORCE_EXCLUDED_FILES_KEY);
      
      let includedSet = new Set<string>();
      let excludedSet = new Set<string>();
      
      try {
        if (cachedIncluded) includedSet = new Set(JSON.parse(cachedIncluded));
        if (cachedExcluded) excludedSet = new Set(JSON.parse(cachedExcluded));
      } catch (e) {
        console.error("Error parsing cached file selections:", e);
      }
      
      // Update status before reading files
      setLoadingStatus("Reading all non-ignored files via git...");
      
      // Call server action to read files
      const result = await readDirectoryAction(directory);
      
      // Handle errors
      if (!result.isSuccess) {
        setError(result.message || "Failed to read git repository");
        return;
      }
      
      if (!result.data || Object.keys(result.data).length === 0) {
        setError("No text files found in the git repository. Files may be binary or in .gitignore.");
        return;
      }
      
      // Process loaded files
      setLoadingStatus("Processing files from git repository...");
      console.log(`Successfully read ${Object.keys(result.data).length} files from git repository`);
      
      // Create a new files map with file info
      const newFilesMap: FilesMap = {};
      
      // Process each file
      Object.entries(result.data).forEach(([filePath, content]) => {
        // Check if file was previously included or excluded
        const isIncluded = includedSet.has(filePath);
        const isExcluded = excludedSet.has(filePath);
        
        // Create file info object
        newFilesMap[filePath] = {
          path: filePath,
          size: new Blob([content as string]).size,
          forceExcluded: isExcluded,
          included: isIncluded || (!isExcluded && shouldIncludeByDefault(filePath)),
        };
      });
      
      // Update state with loaded files
      setFileContentsMap(result.data || {});
      setAllFilesMap(newFilesMap);
      
      console.log(`Processed ${Object.keys(newFilesMap).length} files from git repository`);
    } catch (err) {
      console.error("Failed to read git repository:", err);
      setError(`Failed to read git repository: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingFiles(false);
      setLoadingStatus("");
    }
  }, [repository, outputFormat, shouldIncludeByDefault]);
  
  // Load cached states and files when project directory context changes
   useEffect(() => {
    if (projectDirectory && outputFormat) {
      console.log(`[Init] Project/Format changed: ${projectDirectory} / ${outputFormat}. Checking for active session...`);
      // Check if there's a saved active session ID first
      const checkActiveSessionId = async () => {
        const savedActiveSessionId = await repository.getActiveSessionId(projectDirectory, outputFormat);
        
        if (savedActiveSessionId) {
          console.log(`[Load] Found active session ID: ${savedActiveSessionId}`);
          setSessionRestoreAttempted(false); // Reset restore attempt flag
          setActiveSessionId(savedActiveSessionId);
          // Important: Load files *first* before attempting session restore.
          // Session restore needs the file list (allFilesMap) to apply selections.
          await handleLoadFiles(projectDirectory);
          setSessionRestoreAttempted(true); // Mark as attempted even if session needs restore
        } else {
          console.log("No active session found, loading cached state.");
          setSessionRestoreAttempted(false); // Reset restore attempt flag
          setActiveSessionId(null); // Explicitly set to null
          // Only load cached states if no active session
          await loadCachedStates(projectDirectory, outputFormat);
          await handleLoadFiles(projectDirectory);
          setSessionRestoreAttempted(true);
        }
      };
      
      checkActiveSessionId();
    } else {
      // If project directory or format changes to empty/null, clear state
      setAllFilesMap({});
      setFileContentsMap({});
      setActiveSessionId(null);
      setSessionRestoreAttempted(true); // Mark as attempted if no project dir
    }
  }, [projectDirectory, outputFormat, repository, handleLoadFiles, loadCachedStates]); // Removed setProjectDirectory, activeSessionId
  
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  // Handler for when a directory is selected/entered in the selector component
  const handleProjectDirectorySelected = useCallback(async (value: string) => {
    if (!value) {
      setError("Please select or enter a valid project directory");
      return;
    }

    setIsLoadingFiles(true);
    setLoadingStatus("Initializing...");
    
    // Clear state before loading new directory
    setAllFilesMap({}); 
    setFileContentsMap({});
    setPrompt("");
    setError("");

    try {
      // Update project directory in context
      setProjectDirectory(value);
      
      // Load files from the selected directory
      await handleLoadFiles(value);
    } catch (err) {
      console.error("Error processing directory selection:", err);
      setError(`Failed to process directory: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoadingFiles(false);
      setLoadingStatus("");
    }
  }, [setProjectDirectory, handleLoadFiles]);

  // Load cached states and files when project directory context changes
  useEffect(() => {
    if (!projectDirectory || !outputFormat || !repository) {
      // Clear state if no project directory
      setAllFilesMap({});
      setFileContentsMap({});
      setActiveSessionId(null);
      setSessionRestoreAttempted(true);
      return;
    }
    
    console.log(`Project/Format changed: ${projectDirectory} / ${outputFormat}`);
    
    const initializeProjectData = async () => {
      try {
        setSessionRestoreAttempted(false);
        
        // Check if there's a saved active session ID first
        const savedActiveSessionId = await repository.getActiveSessionId(projectDirectory, outputFormat);
        
        if (savedActiveSessionId) {
          console.log(`Found active session ID: ${savedActiveSessionId}`);
          setActiveSessionId(savedActiveSessionId);
          
          // Important: Load files before attempting session restore
          await handleLoadFiles(projectDirectory);
        } else {
          console.log("No active session found, loading cached state");
          setActiveSessionId(null);
          
          // Only load cached states if no active session
          await loadCachedStates(projectDirectory, outputFormat);
          await handleLoadFiles(projectDirectory);
        }
      } catch (error) {
        console.error("Error initializing project data:", error);
        setError(`Failed to initialize project: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setSessionRestoreAttempted(true);
      }
    };
    
    initializeProjectData();
  }, [projectDirectory, outputFormat, repository, handleLoadFiles, loadCachedStates]);

  const handleTaskChange = useCallback(async (value: string) => {
    // Always update local state immediately
    setTaskDescription(value);
    // Do not clear active session ID automatically on input change
    
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
            await repository.saveCachedState(projectDirectory, outputFormat, TASK_DESC_KEY, value);
            // console.log("Saved task description to cache"); // Reduce noise
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
      } else {
        console.warn("Cannot save task description: No project directory set");
      }
    }, 1000); // 1 second debounce

  }, [activeSessionId, projectDirectory, outputFormat, repository, setActiveSessionId]);

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

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    // Debounced save handled by useEffect
  }, []); // Added empty dependency array

  const handlePastedPathsChange = useCallback((value: string) => {
    setPastedPaths(value);
    // Debounced save handled by useEffect
  }, []); // Added empty dependency array

  const handlePatternDescriptionChange = useCallback((value: string) => {
    setPatternDescription(value);
    // Debounced save handled by useEffect
  }, []); // Added empty dependency array

  const handleTitleRegexChange = useCallback((value: string) => {
    setTitleRegex(value);
    // Debounced save handled by useEffect
  }, []); // Added empty dependency array

  const handleContentRegexChange = useCallback((value: string) => {
    setContentRegex(value);
    // Debounced save handled by useEffect
  }, []); // Added empty dependency array

  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    setTitleRegexError(null);
    setContentRegexError(null);
    // Debounced save handled by useEffect // Removed comment
  }, []);

  const handleToggleRegexActive = useCallback(() => {
    const newValue = !isRegexActive;
    setIsRegexActive(newValue);
    // Debounced save handled by useEffect
  }, [isRegexActive]); // Added isRegexActive dependency

  const handleGenerateRegex = useCallback(async () => {
    if (!patternDescription.trim()) {
      setRegexGenerationError("Please enter a pattern description first.");
      return;
    }

    setIsGeneratingRegex(true);
    setRegexGenerationError("");
    try {
      console.log("Generating regex patterns for:", patternDescription);
      const result = await generateRegexPatternsAction(patternDescription, codebaseStructure || undefined);
      console.log("Regex generation result:", result);
      
      if (result.isSuccess && result.data) {
        const newTitleRegex = result.data.titleRegex || "";
        const newContentRegex = result.data.contentRegex || "";
        setTitleRegex(newTitleRegex);
        setContentRegex(newContentRegex);
        setRegexGenerationError(""); // Clear error on success
        // Don't clear active session ID when regex is auto-generated
      } else {
        setRegexGenerationError(result.message || "Failed to generate regex patterns.");
      }
    } catch (error) {
      console.error("Error in handleGenerateRegex:", error);
      setRegexGenerationError(error instanceof Error ? error.message : "Unexpected error generating regex patterns");
    } finally {
      setIsGeneratingRegex(false);
    }
  }, [patternDescription, codebaseStructure]); // Added codebaseStructure dependency

  const handleCodebaseStructureChange = useCallback((value: string) => {
    setCodebaseStructure(value);
  }, []);

  // Update allFilesMap state from child components (FileBrowser, PastePaths)
  const handleFilesMapChange = useCallback((newMap: FilesMap) => {
    setAllFilesMap(newMap);
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
            // Legacy path lookup - original path matches directly
            if (currentFileContents[filePath] !== undefined) {
              filesToUse.push(filePath);
            } else {
              // Should theoretically not happen if we just got fresh content
              warnings.push(`Could not find content for project path "${filePath}".`);
              console.warn(`Content missing for project path: ${filePath}`);
            }
          } else {
            // Path is potentially external (absolute or relative outside project root handled by readExternal)
            setLoadingStatus(`Reading external file: ${filePath}...`); // Update status message
            const externalFileResult = await readExternalFileAction(filePath);
            if (externalFileResult.isSuccess && externalFileResult.data) {
              // Merge external content into our temporary map for this generation
              currentFileContents = { ...currentFileContents, ...externalFileResult.data };
              // Add the path (using the key from externalFileResult.data which is the original path)
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
             setIsLoading(true); // Keep loading state if error occurs here
             setLoadingStatus("");
             if (warnings.length > 0) setExternalPathWarnings(warnings);
             return; // Important: exit if no pasted paths were usable
        }
      } else if (isAnyFileIncludedFromBrowser) {
        setLoadingStatus("Using selected files...");
        // No pasted paths, use files selected in the browser from the state
        // Filter the *currentFileContents* using the selection state from *allFilesMap*
        const selectedPaths = new Set(Object.values(allFilesMap).filter(f => f.included && !f.forceExcluded).map(f => f.path));

          console.log("Selected paths from browser:", selectedPaths);
        
        // Create a map of normalized paths to original paths for better matching
        const normalizedToOriginal: Record<string, string> = {};
        Object.keys(currentFileContents).forEach(originalPath => {
          const normalizedPath = normalizePath(originalPath, projectDirectory); // Use normalizePath utility
          normalizedToOriginal[normalizedPath] = originalPath;
        });
        
        // Check both original and normalized paths to ensure we find matches
        filesToUse = Object.keys(currentFileContents) // Use Object.keys(currentFileContents)
          .filter(path => selectedPaths.has(path) && currentFileContents[path] !== undefined);

        
        // Log resolved file paths for debugging
        console.log("Resolved file paths from browser:", filesToUse);
        console.log("Files to use:", filesToUse);
      } else {
        // Neither pasted paths nor browser selection
        setError("Please include at least one file using the file browser or paste file paths.");
        setIsLoading(false);
        setLoadingStatus("");
        return;
      }

      if (warnings.length > 0) {
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
        
      // Log final prompt paths for debugging
      console.log("Final paths in prompt:", Object.entries(currentFileContents)
        .filter(([filePath]) => filesToUse.includes(filePath))
        .map(([path]) => path));

      let instructions = await getFormatInstructions(outputFormat, customFormat);

      if (outputFormat === "refactoring") {
        if (codebaseStructure.trim()) { // Only add structure if it exists
          const structureSection = `<structure>
${codebaseStructure}
</structure>`;
          instructions = instructions.replace("{{STRUCTURE_SECTION}}", structureSection);
        } else {
          instructions = instructions
            .replace("{{STRUCTURE_SECTION}}", "")
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
      .filter(f => f.included && !f.forceExcluded)
      .map(f => f.path); // Corrected map function
    
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
      customFormat: customFormat || "", // Ensure customFormat is included, default to empty string
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
    outputFormat,
    customFormat // Add customFormat dependency
  ]);


  // Load session handler
  const handleLoadSession = useCallback((session: Session) => {
    console.log(`Loading session: ${session.name} (${session.id})`);
    setTaskDescription(session.taskDescription || "");
    setSearchTerm(session.searchTerm || "");
    setPastedPaths(session.pastedPaths || "");
    setPatternDescription(session.patternDescription || "");
    setTitleRegex(session.titleRegex || "");
    setContentRegex(session.contentRegex || "");
    setCodebaseStructure(session.codebaseStructure || "");
    setCustomFormat(session.customFormat || ""); // Load custom format
    setIsRegexActive(session.isRegexActive);
    
    // Handle included/excluded files if they exist
    if (session.includedFiles && session.includedFiles.length > 0) {
      // We need to merge with current allFilesMap
      const updatedFilesMap = { ...allFilesMap };
      
      // Reset all files to not included first
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
        }
      });
      
      // Mark force excluded files
      if (session.forceExcludedFiles) {
        session.forceExcludedFiles.forEach(filePath => {
          if (updatedFilesMap[filePath]) {
            updatedFilesMap[filePath].forceExcluded = true;
          }
        });
      }
      
      // Update state
      setAllFilesMap(updatedFilesMap);
    }
    
    // Reset unsaved changes flag
    setHasUnsavedChanges(false);
    setSessionInitialized(true);
  }, [allFilesMap, setCustomFormat]); // Add setCustomFormat dependency

  // Handle form state changes
  const handleFormStateChange = useCallback((hasChanges: boolean) => {
    setHasUnsavedChanges(hasChanges);
  }, []);

    // Create form state object explicitly for the FormStateManager
    // This ensures all relevant state variables are included and passed down
    const formStateForManager = useMemo(() => {
        // Log when this recalculates and what triggered it (implicitly by dependencies changing)
        console.log('[GeneratePromptForm] Recalculating formStateForManager in useMemo');

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
        };
    }, [
        projectDirectory, taskDescription, searchTerm, pastedPaths, patternDescription,
        titleRegex, contentRegex, isRegexActive, codebaseStructure, allFilesMap,
        outputFormat, customFormat
    ]);

  // Add this function to toggle debug mode
  const toggleDebugMode = () => {
    const newDebugMode = !debugMode;
    setDebugMode(newDebugMode);
    
    // If enabling debug mode, generate path debug info
    if (newDebugMode && projectDirectory) { // Only generate if project directory exists
      const debugInfo = Object.keys(allFilesMap).map(originalPath => ({
        original: originalPath,
        normalized: normalizePath(originalPath, projectDirectory)
      }));
      setPathDebugInfo(debugInfo);
    } else {
      setPathDebugInfo([]);
    }
  };

  // Save active session ID whenever it changes
  useEffect(() => {
    // Only save if project and format are valid, and the change didn't originate from the initial load
    if (projectDirectory && outputFormat && sessionRestoreAttempted) {
      console.log("[Save Active ID] Saving active session ID to database:", activeSessionId);
      repository.setActiveSession(projectDirectory, outputFormat, activeSessionId);
    }
  }, [activeSessionId, projectDirectory, outputFormat, repository, sessionRestoreAttempted]);

  // Callback for PastePaths component to update count
  const handlePastedPathsUpdate = useCallback((parsedPaths: string[]) => {
    if (!parsedPaths || parsedPaths.length === 0) {
      setPastedPathsFound(0);
      return;
    }
    setPastedPathsFound(parsedPaths.length);
  }, []);

  return (
    <div className="flex flex-col flex-1 p-2 md:p-4 space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {/* Project Directory Selector - Always visible */}
        <ProjectDirectorySelector />
      
        {/* Session Manager - Now placed directly after Project Directory Selector */}
        <Suspense fallback={<div>Loading session manager...</div>}>
          <SessionManager
            projectDirectory={projectDirectory}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={handleLoadSession}
            outputFormat={outputFormat}
            activeSessionId={activeSessionId}
            setActiveSessionIdExternally={handleSetActiveSessionId}
            onSessionStatusChange={(hasSession) => setSessionInitialized(hasSession)}
          />
          {/* Display auto-save errors near session manager */}
          {sessionSaveError && (
            <div className="text-xs text-destructive text-center mt-0.5 -mb-2">
              ⚠️ Auto-save failed: {sessionSaveError}
            </div>
          )}
        </Suspense>
      
        {/* SessionGuard ensures all form components are only shown when a session exists */}
        <Suspense fallback={<div className="h-[300px] flex items-center justify-center">Loading session manager...</div>}>
          <SessionGuard
            activeSessionId={activeSessionId}
            setActiveSessionId={handleSetActiveSessionId}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={handleLoadSession}
          >
            {/* FormStateManager handles auto-saving form state */}
            <FormStateManager
              activeSessionId={activeSessionId}
              projectDirectory={projectDirectory || ""}
              outputFormat={outputFormat}
              formState={formStateForManager} // Pass the explicitly constructed state
              onStateChange={handleFormStateChange}
              onSaveError={setSessionSaveError}
            >
              {/* Task Description with Voice Transcription */}
              <div className="flex flex-col w-full space-y-2">
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
                    foundFiles={Object.keys(allFilesMap)}
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
              />

              {/* Paste Paths */}
              <PastePaths
                value={pastedPaths}
                onChange={handlePastedPathsChange}
                onParsePaths={handlePastedPathsUpdate}
                foundCount={pastedPathsFound}
                projectDirectory={projectDirectory}
                warnings={externalPathWarnings}
              />

              {/* File Browser */}
              <FileBrowser
                allFilesMap={allFilesMap} // Pass the full map
                fileContentsMap={fileContentsMap} // Pass the contents map
                onFilesMapChange={handleFilesMapChange}
                searchTerm={searchTerm}
                onSearchChange={handleSearchChange}
                titleRegexError={titleRegexError} // Pass error state
                contentRegexError={contentRegexError}
                onTitleRegexErrorChange={setTitleRegexError} // Pass error handlers
                onContentRegexErrorChange={setContentRegexError}
                titleRegex={titleRegex}
                contentRegex={contentRegex}
                isRegexActive={isRegexActive}
                onInteraction={handleInteraction}
                isLoading={isLoadingFiles}
                loadingStatus={loadingStatus}
              />

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
                    <Button
                      type="button"
                      onClick={handleCopy}
                      variant={copySuccess ? "outline" : "secondary"}
                      size="sm"
                      className="text-xs"
                    >
                      {copySuccess ? "Copied!" : "Copy to Clipboard"}
                    </Button>
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
        {!activeSessionId && projectDirectory && outputFormat && !isLoadingFiles && (
          <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md">
            Please create a new session or load an existing one to begin.
          </div>
        )}
      </div>
    </div>
  );
}
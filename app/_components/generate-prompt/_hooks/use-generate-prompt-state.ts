"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { estimateTokens } from "@/lib/token-estimator";
import { useProject } from "@/lib/contexts/project-context";
import { useDatabase } from "@/lib/contexts/database-context";
import { normalizePath } from "@/lib/path-utils";
import { Session } from "@/types";
import { useFileLoader } from "./use-file-loader";
import { usePromptGenerator } from "./use-prompt-generator";
import { trackSelectionChanges } from "../_utils/debug";
import { shouldIncludeByDefault, normalizeFilePath } from "../_utils/file-selection";
import { findRelevantFilesAction } from "@/actions/path-finder-actions";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { generateDirectoryTree } from "@/lib/directory-tree";
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import { sessionSyncService } from '@/lib/services/session-sync-service';

// Constants
const AUTO_SAVE_INTERVAL = 3000; // 3 seconds
const OUTPUT_FORMAT_KEY = "generate-prompt-output-format";
const SEARCH_SELECTED_FILES_ONLY_KEY = "search-selected-files-only";
const PREFERENCE_FILE_SELECTIONS_KEY = "file-selections";
const MODEL_USED_KEY = "model-used";

// Types
export interface FileInfo {
  path: string;
  size: number;
  included: boolean;
  forceExcluded: boolean;
}

export type FilesMap = { [path: string]: FileInfo };
export type OutputFormat = "markdown" | "xml" | "plain";

export function useGeneratePromptState() {
  const { projectDirectory, setProjectDirectory } = useProject();
  const { repository } = useDatabase();
  const { activeSessionId: savedSessionId, setActiveSessionId: setSavedSessionId } = useProject();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // Form state
  const [taskDescription, setTaskDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pastedPaths, setPastedPaths] = useState("");
  const [titleRegex, setTitleRegex] = useState("");
  const [contentRegex, setContentRegex] = useState("");
  const [error, setError] = useState("");
  const [isGeneratingTaskRegex, setIsGeneratingTaskRegex] = useState(false);
  const [regexGenerationError, setRegexGenerationError] = useState("");
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [allFilesMap, setAllFilesMap] = useState<FilesMap>({});
  const [fileContentsMap, setFileContentsMap] = useState<{ [key: string]: string }>({});
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>([]);
  const [isRegexActive, setIsRegexActive] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [pathDebugInfo, setPathDebugInfo] = useState<{ original: string, normalized: string }[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null);
  const [isFormSaving, setIsFormSaving] = useState(false);
  const [isFindingFiles, setIsFindingFiles] = useState(false);
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);
  const [isCopyingPrompt, setIsCopyingPrompt] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnly] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("markdown");
  const [diffTemperature, setDiffTemperature] = useState<number>(0.9);
  const [modelUsed, setModelUsed] = useState<string>(GEMINI_FLASH_MODEL);
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [projectDataLoading, setProjectDataLoading] = useState(false);

  // Refs
  const taskDescriptionRef = useRef<any>(null);
  const saveTaskDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSessionId = useRef<string | null>(null);
  const initializationRef = useRef<{ 
    projectInitialized: boolean; 
    formMounted: boolean; 
    urlProjectInitialized: boolean; 
    initializedProjectDir: string | null; 
  }>({ 
    projectInitialized: false, 
    formMounted: false, 
    urlProjectInitialized: false, 
    initializedProjectDir: null 
  });

  // Initialize file loader hook
  const { 
    loadFiles, 
    refreshFiles, 
    isLoadingFiles, 
    loadingStatus,
    isRefreshingFiles
  } = useFileLoader({
    projectDirectory,
    allFilesMap,
    setAllFilesMap,
    setFileContentsMap,
    shouldIncludeByDefault,
    previousFilesMap: allFilesMap
  });

  // Initialize prompt generator hook
  const {
    prompt,
    tokenCount,
    architecturalPrompt,
    isGenerating,
    copySuccess,
    generatePrompt,
    copyPrompt,
    copyArchPrompt,
    copyTemplatePrompt
  } = usePromptGenerator({
    taskDescription,
    allFilesMap,
    fileContentsMap,
    pastedPaths,
    projectDirectory,
    diffTemperature
  });

  // Derived states
  const { includedPaths, excludedPaths } = useMemo(() => {
    const included = Object.values(allFilesMap)
      .filter(f => f.included && !f.forceExcluded)
      .map(f => f.path);
    
    const excluded = Object.values(allFilesMap)
      .filter(f => f.forceExcluded)
      .map(f => f.path);
    
    return { includedPaths: included, excludedPaths: excluded };
  }, [allFilesMap]);

  // Apply session selections if we have paths but session isn't initialized yet
  useEffect(() => {
    if (!sessionInitialized && projectDirectory && Object.keys(allFilesMap).length > 0 && 
        (includedPaths.length > 0 || excludedPaths.length > 0)) {
      loadFiles(projectDirectory, undefined, {
        included: includedPaths,
        excluded: excludedPaths
      });
    }
  }, [sessionInitialized, projectDirectory, allFilesMap, includedPaths, excludedPaths, loadFiles]);

  const showLoadingOverlay = useMemo(() => {
    return (isLoadingFiles || isRefreshingFiles || isRestoringSession || projectDataLoading) && !isFindingFiles;
  }, [isLoadingFiles, isRefreshingFiles, isRestoringSession, projectDataLoading, isFindingFiles]);

  // Interaction handlers
  const handleInteraction = useCallback(() => {
    setHasUnsavedChanges(true);
    
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
    }
    
    interactionTimeoutRef.current = setTimeout(() => {
      interactionTimeoutRef.current = null;
    }, 500);
  }, []);

  // Local storage utilities for user preferences only
  const getLocalStorageKeyForProject = useCallback((key: string) => {
    const safeProjDir = projectDirectory ? 
      encodeURIComponent(projectDirectory.replace(/[\/\\?%*:|"<>]/g, '_')).substring(0, 50) : 
      'default';
    return `form-backup-${safeProjDir}-${key}`;
  }, [projectDirectory]);

  const savePreferenceToLocalStorage = useCallback((key: string, value: string) => {
    if (!projectDirectory) return;
    
    try {
      const storageKey = getLocalStorageKeyForProject(key);
      localStorage.setItem(storageKey, value);
    } catch (error) {
      console.error(`[LocalStorage] Error saving ${key} to localStorage:`, error);
    }
  }, [projectDirectory, getLocalStorageKeyForProject]);

  const restorePreferenceFromLocalStorage = useCallback((key: string, setter: (value: string) => void, currentValue: string) => {
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
  }, [projectDirectory, getLocalStorageKeyForProject]);

  // Session management
  const handleSetActiveSessionId = useCallback(async (id: string | null) => {
    setActiveSessionId(id);
    setSavedSessionId(id); // Update context
    
    if (id !== savedSessionId) {
      setSessionInitialized(!!id); // Mark as initialized if an ID is set
    }
  }, [savedSessionId, setSavedSessionId]);

  // Effect to reset form state when active session changes
  useEffect(() => {
    if (activeSessionId === null) return;
    
    // Check if we're actually switching sessions (not just initializing)
    if (prevSessionId.current !== null && prevSessionId.current !== activeSessionId) {
      console.log(`[State] Detected session switch from ${prevSessionId.current} to ${activeSessionId}`);
      
      // Reset form state when switching sessions to prevent data leakage
      setTaskDescription("");
      setSearchTerm("");
      setPastedPaths("");
      setTitleRegex("");
      setContentRegex("");
      setIsRegexActive(true);
      
      // Reset session initialized status during transition
      // This prevents premature displaying of the form with mixed state
      setSessionInitialized(false);
      
      console.log(`[State] Reset form state due to session change to: ${activeSessionId}`);
    }
    
    // Remember current session ID for next change
    prevSessionId.current = activeSessionId;
  }, [activeSessionId]);

  const clearFormFields = useCallback(() => {
    setTaskDescription("");
    setSearchTerm("");
    setPastedPaths("");
    setTitleRegex("");
    setContentRegex("");
    setHasUnsavedChanges(false);
    setSessionInitialized(false);
  }, []);

  const handleLoadSession = useCallback(async (sessionIdOrObject: string | Session) => {
    // Handle both string ID and Session object
    const sessionId = typeof sessionIdOrObject === 'string' 
      ? sessionIdOrObject 
      : sessionIdOrObject?.id;
    
    if (!sessionId || isRestoringSession) return;

    // If we're already on this session and it's initialized, don't reload
    if (sessionId === activeSessionId && sessionInitialized) {
      console.log(`[State] Already on session ${sessionId}, skipping reload`);
      return;
    }

    console.log(`[State] Loading session ${sessionId}`);
    setIsRestoringSession(true);
    setSessionInitialized(false); // Explicitly mark as not initialized until fully loaded
    
    try {
      // Use the session synchronization service to coordinate loading
      await sessionSyncService.queueOperation(
        'load',
        sessionId,
        async () => {
          // Get session data from the repository
          const sessionData = await repository.getSession(sessionId);
          
          if (!sessionData) {
            console.warn(`[State] Session ${sessionId} not found`);
            setError(`Session ${sessionId} not found or could not be loaded.`);
            setIsRestoringSession(false);
            // Return void instead of false to match the SessionCallback type
            return;
          }
          
          console.log(`[State] Session loaded:`, sessionData);
          
          // Set form state from session data in a controlled, specific order
          // First set non-file-related settings
          setTaskDescription(sessionData.taskDescription || "");
          setSearchTerm(sessionData.searchTerm || "");
          setPastedPaths(sessionData.pastedPaths || "");
          setTitleRegex(sessionData.titleRegex || "");
          setContentRegex(sessionData.contentRegex || "");
          setIsRegexActive(sessionData.isRegexActive);
          setDiffTemperature(sessionData.diffTemperature || 0.9);
          // Set the model from session data with a fallback to the default
          setModelUsed(sessionData.modelUsed || GEMINI_FLASH_MODEL);
          
          // Prepare session selections
          const sessionSelections = {
            included: sessionData.includedFiles || [],
            excluded: sessionData.forceExcludedFiles || []
          };
          
          // Update directory first (this triggers file loading)
          if (sessionData.projectDirectory && sessionData.projectDirectory !== projectDirectory) {
            console.log(`[GeneratePromptState] Setting project directory to: ${sessionData.projectDirectory}`);
            
            // First set the project directory
            await new Promise<void>((resolve) => {
              setProjectDirectory(sessionData.projectDirectory);
              // Small delay to ensure project directory update propagates
              setTimeout(resolve, 100);
            });
            
            // Then load files with session selections
            await loadFiles(sessionData.projectDirectory, undefined, sessionSelections);
          } else if (projectDirectory) {
            // If already on the same directory, just apply session selections
            await loadFiles(projectDirectory, undefined, sessionSelections);
          }
          
          // Set a small delay to ensure all state has settled
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Mark as initialized and reset unsaved changes
          console.log(`[GeneratePromptState] Marking session as initialized: ${sessionId}`);
          setSessionInitialized(true);
          setHasUnsavedChanges(false);
          setSessionSaveError(null);
          
          // Add a cooldown to prevent immediate auto-saves
          sessionSyncService.setCooldown(sessionId, 'save', 1500);
          
          console.log(`[GeneratePromptState] Session loaded: ${sessionId}`);
        },
        3 // High priority for user-triggered session load
      );
    } catch (error) {
      console.error('Error loading session:', error);
      setError(`Error loading session: ${error}`);
    } finally {
      setIsRestoringSession(false);
    }
  }, [
    isRestoringSession, 
    projectDirectory, 
    setProjectDirectory, 
    loadFiles,
    repository,
    setError,
    setTaskDescription,
    setSearchTerm,
    setPastedPaths,
    setTitleRegex,
    setContentRegex,
    setIsRegexActive,
    setDiffTemperature,
    setModelUsed,
    setSessionInitialized,
    setHasUnsavedChanges,
    setSessionSaveError,
    activeSessionId,
    sessionInitialized
  ]);

  // Field change handlers
  const handleTaskChange = useCallback(async (value: string) => {
    setTaskDescription(value);
    handleInteraction();
  }, [handleInteraction]);

  const handleTranscribedText = useCallback((text: string) => {
    if (taskDescriptionRef.current) {
      taskDescriptionRef.current.insertTextAtCursorPosition(text);
    } else {
      const newText = taskDescription + (taskDescription ? ' ' : '') + text;
      setTaskDescription(newText);
      handleInteraction();
    }
  }, [taskDescription, handleInteraction]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    handleInteraction();
  }, [handleInteraction]);

  const cleanXmlTags = useCallback((input: string): string => {
    return input.split('\n')
      .map(line => line.replace(/<file>|<\/file>/g, '').trim())
      .join('\n');
  }, []);

  const handlePastedPathsChange = useCallback((value: string) => {
    const cleanedValue = cleanXmlTags(value);
    setPastedPaths(cleanedValue);
    handleInteraction();
  }, [cleanXmlTags, handleInteraction]);

  const handlePathsPreview = useCallback((paths: string[]) => {
    if (!paths || paths.length === 0) return;
    
    const pathsText = paths.join('\n');
    setPastedPaths(pathsText);
    handleInteraction();
  }, [handleInteraction]);

  const handleTitleRegexChange = useCallback((value: string) => {
    setTitleRegex(value);
    handleInteraction();
  }, [handleInteraction]);

  const handleContentRegexChange = useCallback((value: string) => {
    setContentRegex(value);
    handleInteraction();
  }, [handleInteraction]);

  const handleGenerateRegexFromTask = useCallback(async () => {
    if (!taskDescription.trim()) {
      setRegexGenerationError("Task description cannot be empty.");
      return;
    }

    setIsGeneratingTaskRegex(true);
    setRegexGenerationError("");

    try {
      // Generate directory tree structure for regex context
      let dirTreeOption;
      if (projectDirectory) {
        try {
          dirTreeOption = await generateDirectoryTree(projectDirectory);
          console.log("Generated directory tree for regex context");
        } catch (treeError) {
          console.error("Error generating directory tree:", treeError);
          // Fall back to just the path if tree generation fails
          dirTreeOption = normalizePath(projectDirectory);
        }
      }
      
      const result = await generateRegexPatternsAction(taskDescription, dirTreeOption);
      
      if (result.isSuccess && result.data) {
        console.log("Received regex patterns:", result.data);
        
        // Set the received regex patterns
        const { titleRegex: newTitleRegex, contentRegex: newContentRegex } = result.data;
        
        // Only set if not undefined
        if (newTitleRegex !== undefined) {
          setTitleRegex(newTitleRegex);
        }
        
        if (newContentRegex !== undefined) {
          setContentRegex(newContentRegex);
        }
        
        // Ensure regex is active
        setIsRegexActive(true);
        
        handleInteraction();
      } else {
        // Display error
        const errorMessage = result.message || "Unknown error generating regex patterns.";
        console.error("Error generating regex patterns:", errorMessage);
        setRegexGenerationError(`Error generating regex patterns: ${errorMessage}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error in handleGenerateRegex:", error);
      setRegexGenerationError(`Error generating regex patterns: ${errorMessage}`);
    } finally {
      setIsGeneratingTaskRegex(false);
    }
  }, [taskDescription, projectDirectory, handleInteraction]);

  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    handleInteraction();
  }, [handleInteraction]);

  const handleToggleRegexActive = useCallback(() => {
    const newValue = !isRegexActive;
    setIsRegexActive(newValue);
    handleInteraction();
  }, [isRegexActive, handleInteraction]);

  const handleFilesMapChange = useCallback(async (filesMap: FilesMap) => {
    // Track file selection changes in debug mode
    if (debugMode) {
      const changes = trackSelectionChanges(allFilesMap, filesMap);
      if (changes.length > 0) {
        console.log('File selection changes:', changes);
      }
    }
    
    setAllFilesMap(filesMap);
    handleInteraction();
  }, [allFilesMap, debugMode, handleInteraction]);

  const handleAddPathToPastedPaths = useCallback((pathToAdd: string) => {
    // Normalize path to ensure consistent format
    const normalizedPath = normalizeFilePath(pathToAdd, projectDirectory);
    
    // Check if path already exists in pasted paths
    const existingPaths = pastedPaths.split('\n').map(p => p.trim()).filter(Boolean);
    if (existingPaths.includes(normalizedPath)) {
      return; // Already exists, nothing to do
    }
    
    const newPastedPaths = existingPaths.length > 0
      ? `${pastedPaths}\n${normalizedPath}`
      : normalizedPath;
    
    setPastedPaths(newPastedPaths);
    handleInteraction();
  }, [pastedPaths, projectDirectory, handleInteraction]);

  const toggleSearchSelectedFilesOnly = useCallback(async () => {
    const newValue = !searchSelectedFilesOnly;
    setSearchSelectedFilesOnly(newValue);
    try {
      localStorage.setItem(SEARCH_SELECTED_FILES_ONLY_KEY, String(newValue));
    } catch (e) {
      console.error('Failed to save search filter preference:', e);
    }
  }, [searchSelectedFilesOnly]);

  const toggleOutputFormat = useCallback(async () => {
    const formats: OutputFormat[] = ["markdown", "xml", "plain"];
    const currentIndex = formats.indexOf(outputFormat);
    const nextIndex = (currentIndex + 1) % formats.length;
    const newFormat = formats[nextIndex];
    
    setOutputFormat(newFormat);
    try {
      localStorage.setItem(OUTPUT_FORMAT_KEY, newFormat);
    } catch (e) {
      console.error('Failed to save output format preference:', e);
    }
  }, [outputFormat]);

  // Form state for FormStateManager
  const formStateForManager = useMemo(() => {
    return {
      projectDirectory,
      taskDescription,
      searchTerm,
      pastedPaths,
      titleRegex,
      contentRegex,
      isRegexActive,
      diffTemperature,
      modelUsed,
      includedFiles: includedPaths,
      forceExcludedFiles: excludedPaths
    };
  }, [
    projectDirectory,
    taskDescription,
    searchTerm,
    pastedPaths,
    titleRegex,
    contentRegex,
    isRegexActive,
    diffTemperature,
    modelUsed,
    includedPaths,
    excludedPaths
  ]);

  // Get current session state
  const getCurrentSessionState = useCallback(() => {
    return {
      id: activeSessionId || '',
      projectDirectory: projectDirectory || '',
      taskDescription,
      searchTerm,
      pastedPaths,
      titleRegex,
      contentRegex,
      isRegexActive,
      diffTemperature,
      modelUsed,
      includedFiles: includedPaths,
      forceExcludedFiles: excludedPaths,
      name: '', // Session name is managed by the SessionManager
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }, [
    activeSessionId,
    projectDirectory,
    taskDescription,
    searchTerm,
    pastedPaths,
    titleRegex,
    contentRegex,
    isRegexActive,
    diffTemperature,
    modelUsed,
    includedPaths,
    excludedPaths
  ]);

  // Initialization from URL parameters
  useEffect(() => {
    if (!searchParams || initializationRef.current.urlProjectInitialized) return;
    
    const dirParam = searchParams.get('dir');
    if (dirParam) {
      console.log(`[URL Init] Directory from URL: ${dirParam}`);
      setProjectDirectory(dirParam);
      initializationRef.current.urlProjectInitialized = true;
    }
  }, [searchParams, setProjectDirectory]);

  // Initialize project data when directory is selected
  useEffect(() => {
    if (!projectDirectory) {
      console.log('[Form Init] No project directory selected.');
      return;
    }

    const normalizedProjectDir = normalizePath(projectDirectory);
    console.log(`[Form Init] Project selected: ${normalizedProjectDir}. Initializing...`);
    
    if (initializationRef.current.initializedProjectDir === normalizedProjectDir) {
      console.log(`[Form Init] Already initialized for project: ${normalizedProjectDir}`);
      return;
    }
    
    const initializeProjectData = async (dirToLoad: string) => {
      console.log(`[Form Init] Starting project data initialization for: ${dirToLoad}`);
      setProjectDataLoading(true);
      
      try {
        // First, load file list for the project
        await loadFiles(dirToLoad);
        
        // Then load the active session ID for this project
        console.log(`[Form Init] Loading active session ID for project: ${dirToLoad}`);
        const savedActiveSessionId = await repository.getActiveSessionId(dirToLoad);
        
        if (savedActiveSessionId) {
          console.log(`[Form Init] Active session ID ${savedActiveSessionId} found for project. Loading session...`);
          try {
            const sessionToLoad = await repository.getSession(savedActiveSessionId);
            
            if (sessionToLoad) {
              console.log(`[Form Init] Loading session data: ${sessionToLoad.name}`);
              handleLoadSession(savedActiveSessionId);
            } else {
              console.warn(`[Form Init] Active session ${savedActiveSessionId} not found in DB. Clearing active session.`);
              await repository.setActiveSession(dirToLoad, null);
              handleSetActiveSessionId(null);
              clearFormFields();
            }
          } catch (error) {
            console.error(`[Form Init] Error loading active session: ${error}`);
            await repository.setActiveSession(dirToLoad, null);
            handleSetActiveSessionId(null);
            clearFormFields();
          }
        } else {
          console.log("[Form Init] No active session for project, clearing form fields");
          clearFormFields();
        }
        
        initializationRef.current.initializedProjectDir = normalizedProjectDir;
        initializationRef.current.projectInitialized = true;
      } catch (error) {
        console.error(`[Form Init] Error initializing project data: ${error}`);
        setAllFilesMap({});
        setFileContentsMap({});
        handleSetActiveSessionId(null);
        clearFormFields();
      } finally {
        setProjectDataLoading(false);
      }
    };
    
    initializeProjectData(normalizedProjectDir);
  }, [
    projectDirectory, 
    repository, 
    loadFiles, 
    handleSetActiveSessionId, 
    handleLoadSession, 
    clearFormFields
  ]);

  // Load preferences on init
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const savedFormat = localStorage.getItem(OUTPUT_FORMAT_KEY);
        if (savedFormat && (savedFormat === 'markdown' || savedFormat === 'xml' || savedFormat === 'plain')) {
          setOutputFormat(savedFormat as OutputFormat);
        }
        
        const searchFilterPref = localStorage.getItem(SEARCH_SELECTED_FILES_ONLY_KEY);
        if (searchFilterPref !== null) {
          setSearchSelectedFilesOnly(searchFilterPref === 'true');
        }
        
        const modelPref = localStorage.getItem(MODEL_USED_KEY);
        if (modelPref) {
          setModelUsed(modelPref);
        }
      } catch (e) {
        console.error('Error loading preferences:', e);
      }
    };
    
    loadPreferences();
  }, []);

  // Save model preference when it changes
  useEffect(() => {
    try {
      localStorage.setItem(MODEL_USED_KEY, modelUsed);
    } catch (e) {
      console.error('Failed to save model preference:', e);
    }
  }, [modelUsed]);

  // Reset copySuccess state after a delay
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => {
        // Reset the copy success state
        if (copyPrompt && typeof copyPrompt === 'function') {
          // We can't reset directly as copyPrompt is a function
          // The success state will be handled by prompt generator hook
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess, copyPrompt]);

  // Reset taskCopySuccess state after a delay
  useEffect(() => {
    if (taskCopySuccess) {
      const timer = setTimeout(() => setTaskCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [taskCopySuccess]);

  // Add the handleFindRelevantFiles function
  const handleFindRelevantFiles = useCallback(async () => {
    if (!taskDescription.trim() || !projectDirectory) {
      return;
    }

    setIsFindingFiles(true);
    setError("");

    try {
      const result = await findRelevantFilesAction(projectDirectory, taskDescription);
      if (result.isSuccess && result.data) {
        // Use the paths returned from the action
        const paths = result.data.relevantPaths;
        const pathsText = paths.join('\n');
        setPastedPaths(pathsText);
        
        // If there's enhanced guidance, add it to the task description
        if (result.data.enhancedTaskDescription) {
          // Optionally use the enhanced task description
          // setTaskDescription(prevDesc => `${prevDesc}\n\n${result.data.enhancedTaskDescription}`);
        }
        
        handleInteraction();
      } else {
        setError(result.message || "Failed to find relevant files");
      }
    } catch (error) {
      console.error("Error finding relevant files:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Error finding relevant files: ${errorMessage}`);
    } finally {
      setIsFindingFiles(false);
    }
  }, [taskDescription, projectDirectory, handleInteraction]);

  // Update refresh project handler to preserve selections
  const handleRefreshProject = useCallback(async () => {
    if (!projectDirectory) return;
    
    try {
      setError("");
      await refreshFiles(true); // Pass true to preserve selection state
    } catch (error) {
      console.error('Error refreshing project:', error);
      setError(`Error refreshing project: ${error}`);
    }
  }, [projectDirectory, refreshFiles]);

  // Export both state and actions
  return {
    state: {
      // Project and session state
      projectDirectory,
      activeSessionId,
      sessionInitialized,
      isRestoringSession,
      sessionSaveError,
      hasUnsavedChanges,
      
      // Loading states
      isLoading: isGenerating,
      isLoadingFiles,
      isRefreshingFiles,
      isFindingFiles,
      isGeneratingTaskRegex,
      isGeneratingGuidance,
      isCopyingPrompt,
      isFormSaving,
      projectDataLoading,
      showLoadingOverlay,
      loadingStatus,
      
      // File states
      allFilesMap,
      fileContentsMap,
      includedPaths,
      excludedPaths,
      
      // Form input states
      taskDescription,
      searchTerm,
      pastedPaths,
      titleRegex,
      contentRegex,
      isRegexActive,
      searchSelectedFilesOnly,
      outputFormat,
      diffTemperature,
      
      // Output states
      prompt,
      error,
      regexGenerationError,
      tokenCount,
      architecturalPrompt,
      externalPathWarnings,
      copySuccess,
      taskCopySuccess,
      
      // Debug states
      debugMode,
      pathDebugInfo,
      
      // References
      taskDescriptionRef,
      formStateForManager,
    },
    
    actions: {
      // Project and session actions
      setProjectDirectory,
      handleSetActiveSessionId,
      handleLoadSession,
      setSessionInitialized,
      getCurrentSessionState,
      
      // File operations
      loadFiles,
      refreshFiles,
      handleFilesMapChange,
      
      // Form input handlers
      handleTaskChange,
      handleTranscribedText,
      handleSearchChange,
      handlePastedPathsChange,
      handlePathsPreview,
      handleTitleRegexChange,
      handleContentRegexChange,
      handleClearPatterns,
      handleToggleRegexActive,
      handleAddPathToPastedPaths,
      toggleSearchSelectedFilesOnly,
      toggleOutputFormat,
      setDiffTemperature,
      handleGenerateRegexFromTask,
      
      // Output actions
      generatePrompt,
      copyPrompt,
      handleFindRelevantFiles,
      copyArchPrompt,
      copyTemplatePrompt,
      setError,
      
      // General handlers
      handleInteraction,
      setIsFormSaving,
      setSessionSaveError,
      handleRefreshProject,
      setHasUnsavedChanges,
    },
    modelUsed,
    setModelUsed,
  };
} 
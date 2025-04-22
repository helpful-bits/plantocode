"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { estimateTokens } from "@/lib/token-estimator";
import { useProject } from "@/lib/contexts/project-context";
import { useDatabase } from "@/lib/contexts/database-context";
import { normalizePath } from "@/lib/path-utils";
import { useGeminiProcessor } from '@/app/_components/gemini-processor/gemini-processor-context';
import { Session } from "@/types";
import { useFileLoader } from "./use-file-loader";
import { usePromptGenerator } from "./use-prompt-generator";
import { trackSelectionChanges } from "../_utils/debug";
import { shouldIncludeByDefault, normalizeFilePath } from "../_utils/file-selection";
import { findRelevantFilesAction } from "@/actions/path-finder-actions";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { generateDirectoryTree } from "@/lib/directory-tree";

// Constants
const AUTO_SAVE_INTERVAL = 3000; // 3 seconds
const LOCAL_STORAGE_KEY = "o1pro.generate-prompt.form-state";
const OUTPUT_FORMAT_KEY = "generate-prompt-output-format";
const SEARCH_SELECTED_FILES_ONLY_KEY = "search-selected-files-only";
const FILE_SELECTIONS_KEY = "file-selections";

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
  const { resetProcessorState } = useGeminiProcessor();

  // Form state
  const [taskDescription, setTaskDescription] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [pastedPaths, setPastedPaths] = useState("");
  const [patternDescription, setPatternDescription] = useState("");
  const [titleRegex, setTitleRegex] = useState("");
  const [contentRegex, setContentRegex] = useState("");
  const [error, setError] = useState("");
  const [regexGenerationError, setRegexGenerationError] = useState("");
  const [isGeneratingRegex, setIsGeneratingRegex] = useState(false);
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
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [projectDataLoading, setProjectDataLoading] = useState(false);

  // Refs
  const taskDescriptionRef = useRef<any>(null);
  const saveTaskDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Local storage utilities
  const getLocalStorageKeyForProject = useCallback((key: string) => {
    const safeProjDir = projectDirectory ? 
      encodeURIComponent(projectDirectory.replace(/[\/\\?%*:|"<>]/g, '_')).substring(0, 50) : 
      'default';
    return `form-backup-${safeProjDir}-${key}`;
  }, [projectDirectory]);

  const saveToLocalStorage = useCallback((key: string, value: string) => {
    if (!projectDirectory) return;
    
    try {
      const storageKey = getLocalStorageKeyForProject(key);
      localStorage.setItem(storageKey, value);
    } catch (error) {
      console.error(`[LocalStorage] Error saving ${key} to localStorage:`, error);
    }
  }, [projectDirectory, getLocalStorageKeyForProject]);

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
  }, [projectDirectory, getLocalStorageKeyForProject]);

  // Session management
  const handleSetActiveSessionId = useCallback(async (id: string | null) => {
    setActiveSessionId(id);
    setSavedSessionId(id); // Update context
    
    if (id !== savedSessionId) {
      setSessionInitialized(!!id); // Mark as initialized if an ID is set
    }
  }, [savedSessionId, setSavedSessionId]);

  const clearFormFields = useCallback(() => {
    setTaskDescription("");
    setSearchTerm("");
    setPastedPaths("");
    setPatternDescription("");
    setTitleRegex("");
    setContentRegex("");
    setHasUnsavedChanges(false);
    setSessionInitialized(false);
    
    // Also clear saved file selections for this project
    if (projectDirectory) {
      localStorage.removeItem(getLocalStorageKeyForProject(FILE_SELECTIONS_KEY));
    }
  }, [projectDirectory, getLocalStorageKeyForProject]);

  const handleLoadSession = useCallback((session: Session) => {
    if (!session || isRestoringSession) return;

    console.log(`[GeneratePromptState] Loading session: ${session.id}`);
    setIsRestoringSession(true);
    
    try {
      // Extract relevant parts of session
      const {
        taskDescription: sessionTaskDescription,
        patternDescription: sessionPatternDescription,
        titleRegex: sessionTitleRegex,
        contentRegex: sessionContentRegex,
        projectDirectory: sessionProjectDirectory,
        includedFiles,
        forceExcludedFiles,
        pastedPaths: sessionPastedPaths,
        isRegexActive: sessionIsRegexActive,
        diffTemperature: sessionDiffTemp,
      } = session;
      
      // Prepare session selections
      const sessionSelections = {
        included: includedFiles || [],
        excluded: forceExcludedFiles || []
      };
      
      // Update directory first (this triggers file loading)
      if (sessionProjectDirectory && sessionProjectDirectory !== projectDirectory) {
        console.log(`[GeneratePromptState] Setting project directory to: ${sessionProjectDirectory}`);
        setProjectDirectory(sessionProjectDirectory);
        
        // Load project files with session selections
        loadFiles(sessionProjectDirectory, undefined, sessionSelections);
      } else if (projectDirectory) {
        // If already on the same directory, just apply session selections
        loadFiles(projectDirectory, undefined, sessionSelections);
      }
      
      // Update form state
      if (sessionTaskDescription) setTaskDescription(sessionTaskDescription);
      if (sessionPatternDescription) setPatternDescription(sessionPatternDescription);
      if (sessionTitleRegex) setTitleRegex(sessionTitleRegex);
      if (sessionContentRegex) setContentRegex(sessionContentRegex);
      if (sessionPastedPaths) setPastedPaths(sessionPastedPaths);
      if (typeof sessionIsRegexActive === 'boolean') setIsRegexActive(sessionIsRegexActive);
      if (typeof sessionDiffTemp === 'number') setDiffTemperature(sessionDiffTemp);
      
      // Session name handling is done by the SessionManager component
      // which has its own onSessionNameChange prop
      
      // Mark as initialized and reset unsaved changes
      setSessionInitialized(true);
      setHasUnsavedChanges(false);
      setSessionSaveError(null);
      
      console.log(`[GeneratePromptState] Session loaded: ${session.id}`);
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
    loadFiles
  ]);

  // Field change handlers
  const handleTaskChange = useCallback(async (value: string) => {
    setTaskDescription(value);
    saveToLocalStorage('task-description', value);
    handleInteraction();
    
    try {
      if (projectDirectory && repository && activeSessionId) {
        const backupDescription = await repository.getCachedState(projectDirectory, 'task-description');
        await repository.saveCachedState(projectDirectory, 'task-description', value);
        console.log('Task description saved directly to prevent loss during HMR');
      }
    } catch (error) {
      console.error("Error saving task description:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setError(`Failed to save task description: ${errorMessage}`);
      
      setTimeout(() => {
        setError(prev => {
          if (prev.includes("Failed to save task description")) {
            return "";
          }
          return prev;
        });
      }, 5000);
    }
  }, [activeSessionId, projectDirectory, repository, handleInteraction, saveToLocalStorage]);

  const handleTranscribedText = useCallback((text: string) => {
    if (taskDescriptionRef.current) {
      taskDescriptionRef.current.insertTextAtCursorPosition(text);
    } else {
      const newText = taskDescription + (taskDescription ? ' ' : '') + text;
      setTaskDescription(newText);
      saveToLocalStorage('task-description', newText);
      handleInteraction();
    }
  }, [taskDescription, handleInteraction, saveToLocalStorage]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    saveToLocalStorage('search-term', value);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]);

  const cleanXmlTags = useCallback((input: string): string => {
    return input.split('\n')
      .map(line => line.replace(/<file>|<\/file>/g, '').trim())
      .join('\n');
  }, []);

  const handlePastedPathsChange = useCallback((value: string) => {
    const cleanedValue = cleanXmlTags(value);
    setPastedPaths(cleanedValue);
    saveToLocalStorage('pasted-paths', cleanedValue);
    handleInteraction();
  }, [cleanXmlTags, handleInteraction, saveToLocalStorage]);

  const handlePathsPreview = useCallback((paths: string[]) => {
    if (!paths || paths.length === 0) return;
    
    const pathsText = paths.join('\n');
    setPastedPaths(pathsText);
    saveToLocalStorage('pasted-paths', pathsText);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]);

  const handlePatternDescriptionChange = useCallback((value: string) => {
    setPatternDescription(value);
    saveToLocalStorage('pattern-description', value);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]);

  const handleTitleRegexChange = useCallback((value: string) => {
    setTitleRegex(value);
    saveToLocalStorage('title-regex', value);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]);

  const handleContentRegexChange = useCallback((value: string) => {
    setContentRegex(value);
    saveToLocalStorage('content-regex', value);
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]);

  const handleGenerateRegex = useCallback(async () => {
    if (!patternDescription.trim()) {
      setRegexGenerationError("Pattern description cannot be empty.");
      return;
    }

    setIsGeneratingRegex(true);
    setRegexGenerationError("");

    try {
      // Generate directory tree structure instead of just using the path
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
      
      const result = await generateRegexPatternsAction(patternDescription, dirTreeOption);
      
      if (result.isSuccess && result.data) {
        // Update regex fields if we got results
        if (result.data.titleRegex) {
          setTitleRegex(result.data.titleRegex);
          saveToLocalStorage('title-regex', result.data.titleRegex);
        }
        
        if (result.data.contentRegex) {
          setContentRegex(result.data.contentRegex);
          saveToLocalStorage('content-regex', result.data.contentRegex);
        }
        
        // Make sure regex is active
        if (!isRegexActive) {
          setIsRegexActive(true);
          saveToLocalStorage('is-regex-active', 'true');
        }
        
        handleInteraction();
      } else {
        setRegexGenerationError(result.message || "Failed to generate regex patterns");
      }
    } catch (error) {
      console.error("Error generating regex patterns:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setRegexGenerationError(`Error generating regex patterns: ${errorMessage}`);
    } finally {
      setIsGeneratingRegex(false);
    }
  }, [patternDescription, projectDirectory, isRegexActive, handleInteraction, saveToLocalStorage]);

  const handleClearPatterns = useCallback(() => {
    setTitleRegex("");
    setContentRegex("");
    saveToLocalStorage('title-regex', "");
    saveToLocalStorage('content-regex', "");
    handleInteraction();
  }, [handleInteraction, saveToLocalStorage]);

  const handleToggleRegexActive = useCallback(() => {
    const newValue = !isRegexActive;
    setIsRegexActive(newValue);
    saveToLocalStorage('is-regex-active', String(newValue));
    handleInteraction();
  }, [isRegexActive, handleInteraction, saveToLocalStorage]);

  const handleFilesMapChange = useCallback(async (filesMap: FilesMap) => {
    // Track file selection changes in debug mode
    if (debugMode) {
      const changes = trackSelectionChanges(allFilesMap, filesMap);
      if (changes.length > 0) {
        console.log('File selection changes:', changes);
      }
    }
    
    setAllFilesMap(filesMap);
    
    // Save file selections to localStorage
    const included = Object.values(filesMap)
      .filter(f => f.included && !f.forceExcluded)
      .map(f => f.path);
    
    const excluded = Object.values(filesMap)
      .filter(f => f.forceExcluded)
      .map(f => f.path);
    
    saveToLocalStorage(FILE_SELECTIONS_KEY, JSON.stringify({ included, excluded }));
    
    handleInteraction();
  }, [allFilesMap, debugMode, handleInteraction, saveToLocalStorage]);

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
    saveToLocalStorage('pasted-paths', newPastedPaths);
    handleInteraction();
  }, [pastedPaths, projectDirectory, handleInteraction, saveToLocalStorage]);

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
      taskDescription,
      searchTerm,
      pastedPaths,
      patternDescription,
      titleRegex,
      contentRegex,
      isRegexActive,
      includedFiles: includedPaths,
      forceExcludedFiles: excludedPaths
    };
  }, [
    taskDescription,
    searchTerm,
    pastedPaths,
    patternDescription,
    titleRegex,
    contentRegex,
    isRegexActive,
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
      patternDescription,
      titleRegex,
      contentRegex,
      isRegexActive,
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
    patternDescription,
    titleRegex,
    contentRegex,
    isRegexActive,
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
              handleLoadSession(sessionToLoad);
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
      } catch (e) {
        console.error('Error loading preferences:', e);
      }
    };
    
    loadPreferences();
  }, []);

  // Restore file selections when project directory changes or files are loaded
  useEffect(() => {
    // Only proceed if we have a project directory and files have been loaded
    if (!projectDirectory || Object.keys(allFilesMap).length === 0) return;
    
    try {
      const savedSelectionsJson = localStorage.getItem(getLocalStorageKeyForProject(FILE_SELECTIONS_KEY));
      if (savedSelectionsJson) {
        const savedSelections = JSON.parse(savedSelectionsJson);
        
        if (savedSelections && 
            (savedSelections.included?.length > 0 || savedSelections.excluded?.length > 0)) {
          console.log(`[LocalStorage] Restoring file selections for project: ${projectDirectory}`);
          
          // Load files with the saved selections
          loadFiles(projectDirectory, undefined, {
            included: savedSelections.included || [],
            excluded: savedSelections.excluded || []
          });
        }
      }
    } catch (error) {
      console.error(`[LocalStorage] Error restoring file selections:`, error);
    }
  }, [projectDirectory, allFilesMap, loadFiles, getLocalStorageKeyForProject]);

  // Reset copySuccess state after a delay
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

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
        saveToLocalStorage('pasted-paths', pathsText);
        
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
  }, [taskDescription, projectDirectory, handleInteraction, saveToLocalStorage]);

  // Update refresh project handler to preserve selections
  const handleRefreshProject = useCallback(async () => {
    if (!projectDirectory) return;
    
    try {
      resetProcessorState();
      setError("");
      await refreshFiles(true); // Pass true to preserve selection state
    } catch (error) {
      console.error('Error refreshing project:', error);
      setError(`Error refreshing project: ${error}`);
    }
  }, [projectDirectory, refreshFiles, resetProcessorState]);

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
      isGeneratingRegex,
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
      patternDescription,
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
      handlePatternDescriptionChange,
      handleTitleRegexChange,
      handleContentRegexChange,
      handleClearPatterns,
      handleToggleRegexActive,
      handleAddPathToPastedPaths,
      toggleSearchSelectedFilesOnly,
      toggleOutputFormat,
      setDiffTemperature,
      handleGenerateRegex,
      
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
    }
  };
} 
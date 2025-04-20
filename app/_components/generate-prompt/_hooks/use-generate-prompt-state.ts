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

// Constants
const AUTO_SAVE_INTERVAL = 3000; // 3 seconds
const LOCAL_STORAGE_KEY = "o1pro.generate-prompt.form-state";
const OUTPUT_FORMAT_KEY = "generate-prompt-output-format";
const SEARCH_SELECTED_FILES_ONLY_KEY = "search-selected-files-only";

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
    shouldIncludeByDefault
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
  }, []);

  const handleLoadSession = useCallback(async (session: Session) => {
    console.log(`Loading session: ${session.name} (${session.id})`);
    setTaskDescription(session.taskDescription || "");
    setProjectDirectory(session.projectDirectory);
    setSearchTerm(session.searchTerm || "");
    setPastedPaths(session.pastedPaths || "");
    setPatternDescription(session.patternDescription || "");
    setTitleRegex(session.titleRegex || "");
    setIsRegexActive(session.isRegexActive ?? true);
    setContentRegex(session.contentRegex || "");
    
    let mapChanged = false;
    if (session.includedFiles && session.includedFiles.length > 0) {
      const updatedFilesMap = { ...allFilesMap };
      
      Object.keys(updatedFilesMap).forEach(key => {
        updatedFilesMap[key] = { 
          ...updatedFilesMap[key], 
          included: false,
          forceExcluded: false
        };
      });
      
      session.includedFiles.forEach(filePath => {
        if (updatedFilesMap[filePath]) {
          updatedFilesMap[filePath].included = true;
          updatedFilesMap[filePath].forceExcluded = false;
          mapChanged = true;
        }
      });
      
      if (session.forceExcludedFiles) {
        session.forceExcludedFiles.forEach(filePath => {
          if (updatedFilesMap[filePath]) {
            updatedFilesMap[filePath].forceExcluded = true;
            updatedFilesMap[filePath].included = false;
            mapChanged = true;
          }
        });
      }
      
      setAllFilesMap(updatedFilesMap);
    }
    
    setActiveSessionId(session.id);
    setHasUnsavedChanges(false);
    setSessionInitialized(true);
    if (mapChanged) {
      handleInteraction();
    }
    console.log(`[Form] Session ${session.id} loaded into form state. Active session ID set.`); 
  }, [allFilesMap, setProjectDirectory, handleInteraction]);

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
      
      // Output actions
      generatePrompt,
      copyPrompt,
      copyArchPrompt,
      copyTemplatePrompt,
      setError,
      
      // General handlers
      handleInteraction,
      setIsFormSaving,
      setSessionSaveError,
    }
  };
} 
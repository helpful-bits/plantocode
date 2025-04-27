"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { estimateTokens } from "@/lib/token-estimator";
import { useProject } from "@/lib/contexts/project-context";
import { normalizePath } from "@/lib/path-utils";
import { Session, TaskSettings, TaskType } from "@/types";
import { useFileLoader } from "./use-file-loader";
import { usePromptGenerator } from "./use-prompt-generator";
import { trackSelectionChanges } from "../_utils/debug";
import { shouldIncludeByDefault, normalizeFilePath } from "../_utils/file-selection";
import { findRelevantFilesAction } from "@/actions/path-finder-actions";
import { generateRegexPatternsAction } from "@/actions/generate-regex-actions";
import { generateDirectoryTree } from "@/lib/directory-tree";
import { GEMINI_FLASH_MODEL, GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { getModelSettingsForProject } from "@/actions/project-settings-actions";
import { cancelGeminiProcessingAction } from '@/actions/gemini-actions';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { useNotification } from '@/lib/contexts/notification-context';
import { useBackgroundJobs } from '@/lib/contexts/background-jobs-context';
import {
  createSessionAction,
  updateSessionProjectDirectoryAction,
  deleteSessionAction,
  renameSessionAction,
  getSessionAction,
} from '@/actions/session-actions';
import {
  sendPromptToGeminiAction,
} from '@/actions/gemini-actions';
import {
  enhanceTaskDescriptionAction
} from '@/actions/task-enhancement-actions';
import {
  generateGuidanceForPathsAction
} from '@/actions/guidance-generation-actions';
import {
  correctPathsAction
} from '@/actions/path-correction-actions';
import globToRegexp from 'glob-to-regexp';
import debounce from '@/lib/utils/debounce';
import { v4 as uuidv4 } from 'uuid';
import { 
  AUTO_RETRY_INTERVAL,
  AUTO_SAVE_INTERVAL,
  GEMINI_MODEL,
} from "@/lib/constants";

// Constants
const OUTPUT_FORMAT_KEY = "generate-prompt-output-format";
const SEARCH_SELECTED_FILES_ONLY_KEY = "search-selected-files-only";
const PREFERENCE_FILE_SELECTIONS_KEY = "file-selections";

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
  const { activeSessionId: savedSessionId, setActiveSessionId: setSavedSessionId } = useProject();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { showNotification } = useNotification();
  const { activeJobs } = useBackgroundJobs();

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
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const [isFormSaving, setIsFormSaving] = useState(false);
  const [isFindingFiles, setIsFindingFiles] = useState(false);
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);
  const [isCopyingPrompt, setIsCopyingPrompt] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [searchSelectedFilesOnly, setSearchSelectedFilesOnly] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("markdown");
  const [diffTemperature, setDiffTemperature] = useState<number>(0.9);
  const [sessionName, setSessionName] = useState<string>("Untitled Session");
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [projectDataLoading, setProjectDataLoading] = useState(false);

  // Refs
  const taskDescriptionRef = useRef<any>(null);
  const saveTaskDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSessionId = useRef<string | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevProjectDirectory = useRef<string | null>(null);
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

  // Auto-save functionality
  const saveFormState = useCallback(async () => {
    if (!activeSessionId || !sessionInitialized || isRestoringSession) return;
    
    try {
      setIsFormSaving(true);
      
      // Only save if we have an active session
      if (activeSessionId) {
        // First, check if the session still exists and what its current data is
        try {
          const currentSession = await sessionSyncService.getSessionById(activeSessionId);
          if (!currentSession) {
            console.error(`[saveFormState] Session ${activeSessionId} no longer exists, cannot save state`);
            setSessionLoadError(`Session no longer exists. Please create a new one.`);
            showNotification({
              title: "Error",
              message: `Session no longer exists. Please create a new one.`,
              type: "error"
            });
            return;
          }
          
          // Create a diff object with only fields that actually changed
          const updatedFields: Partial<Session> = {};
          let hasChanges = false;
          
          // For task description, only update if it's actually different
          if (taskDescription !== currentSession.taskDescription) {
            console.log(`[saveFormState] Task description changed for session ${activeSessionId}:`, {
              oldLength: currentSession.taskDescription?.length || 0,
              newLength: taskDescription?.length || 0,
              oldPreview: currentSession.taskDescription?.substring(0, 40) || 'none',
              newPreview: taskDescription?.substring(0, 40) || 'none'
            });
            updatedFields.taskDescription = taskDescription;
            hasChanges = true;
          }
          
          // Add other fields that might have changed
          if (searchTerm !== currentSession.searchTerm) {
            updatedFields.searchTerm = searchTerm;
            hasChanges = true;
          }
          
          if (pastedPaths !== currentSession.pastedPaths) {
            updatedFields.pastedPaths = pastedPaths;
            hasChanges = true;
          }
          
          if (titleRegex !== currentSession.titleRegex) {
            updatedFields.titleRegex = titleRegex;
            hasChanges = true;
          }
          
          if (contentRegex !== currentSession.contentRegex) {
            updatedFields.contentRegex = contentRegex;
            hasChanges = true;
          }
          
          if (isRegexActive !== currentSession.isRegexActive) {
            updatedFields.isRegexActive = isRegexActive;
            hasChanges = true;
          }
          
          if (diffTemperature !== currentSession.diffTemperature) {
            updatedFields.diffTemperature = diffTemperature;
            hasChanges = true;
          }
          
          if (outputFormat !== currentSession.outputFormat) {
            updatedFields.outputFormat = outputFormat;
            hasChanges = true;
          }
          
          // Check for file selection changes
          const currentIncluded = new Set(currentSession.includedFiles || []);
          const currentExcluded = new Set(currentSession.forceExcludedFiles || []);
          const newIncluded = new Set(includedPaths);
          const newExcluded = new Set(excludedPaths);
          
          const includesDifferent = 
            currentIncluded.size !== newIncluded.size ||
            ![...newIncluded].every(path => currentIncluded.has(path));
            
          const excludesDifferent = 
            currentExcluded.size !== newExcluded.size ||
            ![...newExcluded].every(path => currentExcluded.has(path));
          
          if (includesDifferent) {
            updatedFields.includedFiles = includedPaths;
            hasChanges = true;
          }
          
          if (excludesDifferent) {
            updatedFields.forceExcludedFiles = excludedPaths;
            hasChanges = true;
          }
          
          // Only save if there are actually changes
          if (hasChanges) {
            console.log(`[saveFormState] Saving changes to session ${activeSessionId}:`, 
              Object.keys(updatedFields).join(', '));
            
            // Use the sessionSyncService to save the state
            await sessionSyncService.updateSessionState(activeSessionId, updatedFields);
            setHasUnsavedChanges(false);
            setSessionLoadError(null);
          } else {
            console.log(`[saveFormState] No changes to save for session ${activeSessionId}`);
          }
        } catch (sessionErr) {
          console.error(`[saveFormState] Error checking current session state:`, sessionErr);
          setSessionLoadError(`Failed to check session state: ${sessionErr instanceof Error ? sessionErr.message : String(sessionErr)}`);
          showNotification({
            title: "Warning",
            message: `Could not verify session state before saving. Changes may be incomplete.`,
            type: "warning"
          });
        }
      }
    } catch (error) {
      console.error('[saveFormState] Error saving form state:', error);
      setSessionLoadError(`Failed to save session ${activeSessionId}: ${error instanceof Error ? error.message : String(error)}`);
      showNotification({
        title: "Error",
        message: `Failed to save session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
    } finally {
      setIsFormSaving(false);
    }
  }, [
    activeSessionId,
    sessionInitialized,
    isRestoringSession,
    taskDescription,
    searchTerm,
    pastedPaths,
    titleRegex,
    contentRegex,
    isRegexActive,
    diffTemperature,
    outputFormat,
    includedPaths,
    excludedPaths,
    showNotification
  ]);
  
  // Debounced auto-save
  const debouncedSaveFormState = useMemo(
    () => debounce(saveFormState, AUTO_SAVE_INTERVAL),
    [saveFormState]
  );
  
  // Auto-save when form fields change
  useEffect(() => {
    if (!activeSessionId || !sessionInitialized || isRestoringSession) return;
    
    // Mark as having unsaved changes
    setHasUnsavedChanges(true);
    
    // Schedule auto-save
    debouncedSaveFormState();
    
    // Clear any existing auto-save timeout
    return () => {
      debouncedSaveFormState.cancel();
    };
  }, [
    activeSessionId,
    sessionInitialized,
    isRestoringSession,
    debouncedSaveFormState,
    taskDescription,
    searchTerm,
    pastedPaths,
    titleRegex,
    contentRegex,
    isRegexActive,
    diffTemperature,
    outputFormat
  ]);
  
  // Clear auto-save on unmount
  useEffect(() => {
    const currentTimeoutId = autoSaveTimeoutRef.current;
    
    return () => {
      if (currentTimeoutId) {
        clearTimeout(currentTimeoutId);
      }
    };
  }, []);

  // Helper function to get task-specific model settings
  const getTaskModelSettings = useCallback(async (taskType: TaskType) => {
    if (!projectDirectory) {
      // Default values if no project directory
      return {
        model: GEMINI_FLASH_MODEL,
        maxTokens: taskType === 'xml_generation' ? 65536 : 8192,
        temperature: 0.7
      };
    }
    
    try {
      const settings = await getModelSettingsForProject(projectDirectory);
      if (settings && settings[taskType]) {
        return settings[taskType]!;
      }
    } catch (err) {
      console.error("Error loading project task settings:", err);
    }
    
    // Default values if task settings not configured
    return {
      model: GEMINI_FLASH_MODEL,
      maxTokens: taskType === 'xml_generation' ? 65536 : 8192,
      temperature: 0.7
    };
  }, [projectDirectory]);

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
    console.log(`[State] Setting active session ID: ${id || 'null'} (current: ${activeSessionId || 'null'})`);
    
    // Only reset session initialized if we're changing to a different session
    if (activeSessionId !== id) {
      console.log(`[State] Session ID changed - resetting sessionInitialized flag`);
      setSessionInitialized(false);
    }
    
    // Update local state
    setActiveSessionId(id);
    
    // Update parent context 
    setSavedSessionId(id);
  }, [activeSessionId, setSavedSessionId]);

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

  // Make sure files are loaded when session is initialized
  useEffect(() => {
    if (sessionInitialized && activeSessionId && projectDirectory && Object.keys(allFilesMap).length === 0) {
      console.log(`[State] Session initialized but no files loaded, forcing file refresh`);
      refreshFiles(true); // Preserve selections if any
    }
  }, [sessionInitialized, activeSessionId, projectDirectory, allFilesMap, refreshFiles]);

  // Updated handleLoadSession to properly restore session state
  const handleLoadSession = useCallback(async (sessionData: Session) => {
    if (!sessionData) {
      console.warn(`[State] Cannot load session: no session data provided`);
      return;
    }
    
    console.log(`[State] Loading session: ${sessionData.id} (${sessionData.name || 'Unnamed'})`);
    console.log(`[State] Session task description:`, {
      length: sessionData.taskDescription?.length || 0,
      preview: sessionData.taskDescription ? sessionData.taskDescription.substring(0, 40) + '...' : 'none'
    });
    
    // Set loading state
    setIsRestoringSession(true);
    setSessionInitialized(false); // Ensure initialized state is reset during loading
    setError("");
    
    try {
      // Make sure we have the latest session data (might have changed since we got it)
      let freshSessionData: Session | null = null;
      try {
        freshSessionData = await sessionSyncService.getSessionById(sessionData.id);
        if (freshSessionData) {
          console.log(`[State] Retrieved fresh session data for ${sessionData.id}`, {
            originalTaskLength: sessionData.taskDescription?.length || 0,
            freshTaskLength: freshSessionData.taskDescription?.length || 0,
            taskChanged: sessionData.taskDescription !== freshSessionData.taskDescription
          });
          
          // Use the most up-to-date data
          sessionData = freshSessionData;
        } else {
          console.warn(`[State] Could not retrieve fresh session data for ${sessionData.id}, using provided data`);
        }
      } catch (refreshErr) {
        console.warn(`[State] Error refreshing session data:`, refreshErr);
        // Continue with original session data
      }
      
      // First handle project directory verification/change
      const sessionProjectDir = sessionData.projectDirectory;
      if (!sessionProjectDir) {
        console.error(`[State] Session has no project directory`);
        throw new Error("Session is missing project directory");
      }
      
      // Double-check that we're not loading stale data
      if (activeSessionId === sessionData.id) {
        console.log(`[State] Already loaded session ${sessionData.id}, checking for changes`);
        // If task description is the same, we don't need to reload the entire session
        if (taskDescription === sessionData.taskDescription) {
          console.log(`[State] Task description unchanged, skipping full reload`);
          setSessionInitialized(true);
          setIsRestoringSession(false);
          return;
        }
      }
      
      // Check if we need to switch project directory first
      let projectSwitched = false;
      if (sessionProjectDir !== projectDirectory) {
        console.log(`[State] Session has different project directory - switching from ${projectDirectory} to ${sessionProjectDir}`);
        await setProjectDirectory(sessionProjectDir);
        projectSwitched = true;
        
        // Give time for project directory change to propagate
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // IMPORTANT: Reset all form fields to prevent state mixing
      // This explicit clearing helps prevent data from leaking between sessions
      console.log(`[State] Resetting form fields before loading session data`);
      
      // Task description is most important to clear, do it first
      if (taskDescription) {
        console.log(`[State] Clearing existing task description: ${taskDescription.substring(0, 40)}...`);
        setTaskDescription("");
      }
      
      // Clear other fields
      setTitleRegex("");
      setContentRegex("");
      setIsRegexActive(true);
      setPastedPaths("");
      setSearchTerm("");
      setDiffTemperature(0.9);
      setOutputFormat("markdown");
      
      // Update session ID - important to do this after clearing fields
      await handleSetActiveSessionId(sessionData.id);
      
      // Update session name
      setSessionName(sessionData.name || "Untitled Session");
      
      // Handle file selections after the project directory is confirmed
      if (projectSwitched || Object.keys(allFilesMap).length === 0) {
        console.log(`[State] Loading files for session with selections...`);
        
        try {
          await loadFiles(sessionProjectDir, undefined, {
            included: sessionData.includedFiles || [],
            excluded: sessionData.forceExcludedFiles || []
          });
        } catch (loadError) {
          console.error(`[State] Error loading files from session:`, loadError);
          showNotification({
            title: "Error",
            message: `Could not load files for session: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            type: "error"
          });
        }
      } else {
        // If we already have files loaded but need to apply selections from session
        if (sessionData.includedFiles?.length || sessionData.forceExcludedFiles?.length) {
          console.log(`[State] Applying file selections to existing files...`);
          
          // Create a new files map with the session's selections
          const updatedFilesMap = { ...allFilesMap };
          
          // Reset all selections first
          Object.keys(updatedFilesMap).forEach(path => {
            updatedFilesMap[path] = {
              ...updatedFilesMap[path],
              included: false,
              forceExcluded: false
            };
          });
          
          // Apply included files
          (sessionData.includedFiles || []).forEach(path => {
            if (updatedFilesMap[path]) {
              updatedFilesMap[path] = {
                ...updatedFilesMap[path],
                included: true
              };
            }
          });
          
          // Apply excluded files
          (sessionData.forceExcludedFiles || []).forEach(path => {
            if (updatedFilesMap[path]) {
              updatedFilesMap[path] = {
                ...updatedFilesMap[path],
                forceExcluded: true
              };
            }
          });
          
          // Update the files map
          setAllFilesMap(updatedFilesMap);
        }
      }
      
      // Now populate form fields from session data AFTER files have loaded
      // This ensures we don't have mixed state during loading
      console.log(`[State] Populating form fields from session data`);
      
      // Task description needs special treatment as it's the most critical field
      const sessionTaskDesc = sessionData.taskDescription || "";
      console.log(`[State] Setting task description:`, {
        length: sessionTaskDesc.length,
        preview: sessionTaskDesc ? sessionTaskDesc.substring(0, 40) + '...' : 'none'
      });
      setTaskDescription(sessionTaskDesc);
      
      // Set other fields
      setTitleRegex(sessionData.titleRegex || "");
      setContentRegex(sessionData.contentRegex || "");
      setIsRegexActive(sessionData.isRegexActive !== undefined ? sessionData.isRegexActive : true);
      setPastedPaths(sessionData.pastedPaths || "");
      setSearchTerm(sessionData.searchTerm || "");
      setDiffTemperature(sessionData.diffTemperature || 0.9);
      setOutputFormat(sessionData.outputFormat || "markdown");
      
      // Mark session as initialized and not having unsaved changes
      // This is done at the very end after all state has been restored
      setHasUnsavedChanges(false);
      
      // Brief delay before setting session initialized to ensure everything is in sync
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log(`[State] Setting sessionInitialized to true`);
      setSessionInitialized(true);
      
      console.log(`[State] Session ${sessionData.id} loaded successfully`);
    } catch (error) {
      console.error(`[State] Error loading session:`, error);
      setError(`Failed to load session: ${error instanceof Error ? error.message : String(error)}`);
      showNotification({
        title: "Error",
        message: `Failed to load session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
      setSessionInitialized(false); // Ensure initialized state is reset if loading failed
    } finally {
      setIsRestoringSession(false);
    }
  }, [
    projectDirectory,
    setTaskDescription,
    setSearchTerm,
    setPastedPaths,
    setTitleRegex,
    setContentRegex,
    setIsRegexActive,
    setDiffTemperature,
    setOutputFormat,
    loadFiles,
    showNotification,
    activeSessionId,
    allFilesMap,
    handleSetActiveSessionId,
    setProjectDirectory,
    taskDescription
  ]);

  // Get current session state for saving
  const getCurrentSessionState = (): Partial<Session> => {
    return {
      taskDescription,
      searchTerm,
      pastedPaths,
      titleRegex,
      contentRegex,
      isRegexActive,
      diffTemperature,
      projectDirectory: projectDirectory || "",
      includedFiles: includedPaths,
      forceExcludedFiles: excludedPaths
    };
  };

  // Update handleFindRelevantFiles to use task-specific model settings
  const handleFindRelevantFiles = useCallback(async () => {
    try {
      if (!taskDescription.trim()) {
        showNotification({
          title: "Error",
          message: "Please provide a task description first",
          type: "error"
        });
        return;
      }
      
      if (!activeSessionId) {
        showNotification({
          title: "Error",
          message: "No active session",
          type: "error"
        });
        return;
      }
      
      // Get model settings for pathfinder task
      const settings = await getTaskModelSettings('pathfinder');
      
      setIsFindingFiles(true);
      const result = await findRelevantFilesAction(
        taskDescription,
        projectDirectory,
        activeSessionId,
        { modelOverride: settings.model }
      );
      
      if (!result.isSuccess) {
        throw new Error(result.message);
      }
      
      if (result.data?.relevantPaths && result.data.relevantPaths.length > 0) {
        console.log("Found relevant files:", result.data.relevantPaths);
        
        // Extract the file paths and remove duplicates
        const foundPaths = [...new Set(result.data.relevantPaths)];
        
        // First, update the allFilesMap to include the found paths
        const updatedFilesMap = { ...allFilesMap };
        
        // Mark the found paths as included
        foundPaths.forEach(path => {
          if (updatedFilesMap[path]) {
            updatedFilesMap[path] = {
              ...updatedFilesMap[path],
              included: true
            };
          }
        });
        
        // Update the allFilesMap
        setAllFilesMap(updatedFilesMap);
        
        // Now refresh files with preserveState=true to keep our selections
        refreshFiles(true);
        
        // Update the textarea with the found paths
        setPastedPaths(foundPaths.join('\n'));
        handleInteraction();
        
        showNotification({
          title: "Success",
          message: `Found ${foundPaths.length} files relevant to your task`,
          type: "success"
        });
      } else {
        showNotification({
          title: "Warning",
          message: "No files found that match your task description",
          type: "warning"
        });
      }
    } catch (error) {
      console.error("Error finding relevant files:", error);
      showNotification({
        title: "Error",
        message: `Error finding files: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
    } finally {
      setIsFindingFiles(false);
    }
  }, [
    taskDescription, 
    projectDirectory, 
    activeSessionId, 
    refreshFiles,
    allFilesMap,
    setAllFilesMap,
    showNotification, 
    handleInteraction,
    getTaskModelSettings
  ]);

  // Update handleGenerateRegexFromTask to use task-specific model settings
  const handleGenerateRegexFromTask = useCallback(async () => {
    if (!taskDescription.trim()) return;
    
    setIsGeneratingTaskRegex(true);
    setRegexGenerationError("");
    
    try {
      const result = await generateRegexPatternsAction(taskDescription);
      
      if (result && result.isSuccess && result.data) {
        const { titleRegex, contentRegex } = result.data;
        
        if (titleRegex) {
          setTitleRegex(titleRegex);
        }
        
        if (contentRegex) {
          setContentRegex(contentRegex);
        }
        
        handleInteraction();
      } else {
        setRegexGenerationError(result?.message || "Failed to generate regex patterns. Try again or create them manually.");
      }
    } catch (err) {
      setRegexGenerationError(`Error generating patterns: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsGeneratingTaskRegex(false);
    }
  }, [taskDescription, handleInteraction]);

  // Modify the useEffect for handling project directory changes to explicitly reset session initialization
  useEffect(() => {
    // Reset session initialized state when project directory changes
    if (projectDirectory && prevProjectDirectory.current !== projectDirectory) {
      console.log(`[State] Project directory changed from ${prevProjectDirectory.current || 'none'} to ${projectDirectory}`);
      setSessionInitialized(false);
      // Don't clear activeSessionId here - that should happen in the ProjectContext
    }
    
    // Remember current project directory for next change
    prevProjectDirectory.current = projectDirectory;
  }, [projectDirectory]);

  // Read from storage and restore session state
  const restoreSessionState = useCallback(async (sessionId: string) => {
    console.log(`[restoreSessionState] Attempting to restore session: ${sessionId} (current project: ${projectDirectory})`);
    
    if (!sessionId) {
      console.warn('[restoreSessionState] Cannot restore session: No session ID provided');
      return;
    }
    
    try {
      setIsRestoringSession(true);
      setSessionLoadError(null);
      
      const session = await sessionSyncService.getSessionById(sessionId);
      if (!session) {
        console.error(`[restoreSessionState] Session not found: ${sessionId}`);
        setSessionLoadError(`Session not found: ${sessionId}`);
        showNotification({
          title: "Error",
          message: `Session not found: ${sessionId}`,
          type: "error"
        });
        return;
      }

      console.log(`[restoreSessionState] Loaded session: ${session.name} (ID: ${sessionId})`);
      
      // Check if session's project directory matches current project directory
      if (projectDirectory && session.projectDirectory && 
          projectDirectory !== session.projectDirectory) {
        console.warn(`[restoreSessionState] Session project directory mismatch:`, {
          sessionProject: session.projectDirectory,
          currentProject: projectDirectory
        });
        
        // Ask user if they want to update the session's project directory
        if (window.confirm(
          `This session was created for project "${session.projectDirectory}" but you're now in "${projectDirectory}". ` +
          `Would you like to update this session to use the current project directory?`
        )) {
          console.log(`[restoreSessionState] Updating session project directory to: ${projectDirectory}`);
          await sessionSyncService.updateSessionProjectDirectory(sessionId, projectDirectory);
          session.projectDirectory = projectDirectory;
        } else {
          console.log(`[restoreSessionState] User chose to keep original project directory`);
        }
      }
      
      // Set the active session ID for the project
      if (projectDirectory) {
        await sessionSyncService.setActiveSession(projectDirectory, sessionId);
        console.log(`[restoreSessionState] Set active session for project "${projectDirectory}" to: ${sessionId}`);
      }
      
      // Populate form fields from session data
      setActiveSessionId(sessionId);
      setSessionName(session.name || '');
      
      if (session.taskDescription) {
        setTaskDescription(session.taskDescription);
      }
      
      if (session.searchTerm) {
        setSearchTerm(session.searchTerm);
      }
      
      if (session.pastedPaths) {
        setPastedPaths(session.pastedPaths);
      }
      
      if (session.titleRegex) {
        setTitleRegex(session.titleRegex);
      }
      
      if (session.contentRegex) {
        setContentRegex(session.contentRegex);
      }
      
      if (session.isRegexActive !== undefined) {
        setIsRegexActive(session.isRegexActive);
      }
      
      if (session.diffTemperature !== undefined) {
        setDiffTemperature(session.diffTemperature);
      }
      
      if (session.outputFormat !== undefined) {
        setOutputFormat(session.outputFormat);
      }
      
      // Handle file selections by updating allFilesMap to reflect included and excluded files
      // This will cause includedPaths and excludedPaths to be recalculated via useMemo
      if ((session.includedFiles && session.includedFiles.length > 0) || 
          (session.forceExcludedFiles && session.forceExcludedFiles.length > 0)) {
        
        // When we have files to restore, do it by updating the allFilesMap
        // We'll make sure to load the files properly in the next step
        console.log(`[restoreSessionState] Found file selections to restore:`, {
          includedCount: session.includedFiles?.length || 0,
          excludedCount: session.forceExcludedFiles?.length || 0
        });
        
        // We'll need to load or refresh files with the right selections
        // The file loading mechanism will handle updating allFilesMap
        loadFiles(
          session.projectDirectory || projectDirectory, 
          undefined, 
          {
            included: session.includedFiles || [],
            excluded: session.forceExcludedFiles || []
          }
        );
      }
      
      // Set the state as initialized and clear unsaved changes flag
      setSessionInitialized(true);
      setHasUnsavedChanges(false);
      
      console.log(`[restoreSessionState] Successfully restored session state for: ${sessionId}`);
      
      // Return to the UI that we were successful
      return {
        success: true,
        sessionName: session.name || '',
      };
    } catch (error) {
      console.error('[restoreSessionState] Error restoring session state:', error);
      setSessionLoadError(`Failed to restore session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`);
      showNotification({
        title: "Error",
        message: `Failed to restore session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error"
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      setIsRestoringSession(false);
    }
  }, [
    projectDirectory,
    setActiveSessionId,
    setTaskDescription,
    setSearchTerm,
    setPastedPaths,
    setTitleRegex,
    setContentRegex,
    setIsRegexActive,
    setDiffTemperature,
    setOutputFormat,
    loadFiles,
    showNotification
  ]);

  return {
    state: {
      taskDescription,
      searchTerm,
      pastedPaths,
      titleRegex,
      contentRegex,
      error,
      isGeneratingTaskRegex,
      regexGenerationError,
      titleRegexError,
      contentRegexError,
      allFilesMap,
      fileContentsMap,
      externalPathWarnings,
      isRegexActive,
      activeSessionId,
      debugMode,
      pathDebugInfo,
      hasUnsavedChanges,
      sessionInitialized,
      showLoadingOverlay,
      isRestoringSession,
      sessionLoadError,
      isFormSaving,
      isFindingFiles,
      isGeneratingGuidance,
      isCopyingPrompt,
      isRebuildingIndex,
      searchSelectedFilesOnly,
      outputFormat,
      diffTemperature,
      prompt,
      tokenCount,
      architecturalPrompt,
      isGenerating,
      copySuccess,
      taskCopySuccess,
      projectDirectory,
      loadingStatus,
      sessionName,
      taskDescriptionRef,
      isLoadingFiles,
      isRefreshingFiles
    },
    actions: {
      setTaskDescription,
      setSearchTerm,
      setPastedPaths,
      setTitleRegex,
      setContentRegex,
      setDiffTemperature,
      handleTaskChange: (value: string) => {
        setTaskDescription(value);
        handleInteraction();
      },
      handleTitleRegexChange: (value: string) => {
        setTitleRegex(value);
        handleInteraction();
      },
      handleContentRegexChange: (value: string) => {
        setContentRegex(value);
        handleInteraction();
      },
      setError,
      setExternalPathWarnings,
      handleToggleRegexActive: (active: boolean) => {
        setIsRegexActive(active);
        handleInteraction();
      },
      handleInteraction,
      handleLoadSession,
      handleSetActiveSessionId,
      getCurrentSessionState,
      setHasUnsavedChanges,
      setSessionInitialized,
      clearFormFields: () => {
        setTaskDescription("");
        setSearchTerm("");
        setPastedPaths("");
        setTitleRegex("");
        setContentRegex("");
        setIsRegexActive(true);
        setError("");
        setSessionName("Untitled Session");
        handleInteraction();
      },
      setSessionLoadError,
      setIsFormSaving,
      handleClearPatterns: () => {
        setTitleRegex("");
        setContentRegex("");
        setError("");
        handleInteraction();
      },
      handleFindRelevantFiles,
      generatePrompt,
      copyPrompt,
      copyArchPrompt,
      copyTemplatePrompt,
      setProjectDirectory,
      handleGenerateRegexFromTask,
      handleTranscribedText: (text: string) => {
        if (taskDescriptionRef.current) {
          taskDescriptionRef.current.appendText(text);
        } else {
          setTaskDescription((prev) => prev + (prev ? "\n\n" : "") + text);
        }
        handleInteraction();
      },
      handleToggleSearchSelectedFilesOnly: (value: boolean) => {
        setSearchSelectedFilesOnly(value);
        savePreferenceToLocalStorage(SEARCH_SELECTED_FILES_ONLY_KEY, value ? "true" : "false");
      },
      toggleSearchSelectedFilesOnly: () => {
        setSearchSelectedFilesOnly(prev => !prev);
        savePreferenceToLocalStorage(SEARCH_SELECTED_FILES_ONLY_KEY, !searchSelectedFilesOnly ? "true" : "false");
      },
      handleFilesMapChange: (newMap: FilesMap) => {
        setAllFilesMap(newMap);
        handleInteraction();
      },
      handleSearchChange: (value: string) => {
        setSearchTerm(value);
        handleInteraction();
      },
      handlePastedPathsChange: (value: string) => {
        setPastedPaths(value);
        handleInteraction();
      },
      handlePathsPreview: (paths: string[]) => {
        // If this is just for preview, we don't need to implement anything specific here
        console.log(`[State] Previewing ${paths.length} paths`);
      },
      handleAddPathToPastedPaths: (path: string) => {
        setPastedPaths(prev => {
          const lines = prev.split('\n').filter(line => line.trim());
          // Only add if not already in the list
          if (!lines.includes(path)) {
            lines.push(path);
          }
          return lines.join('\n');
        });
        handleInteraction();
      },
      refreshFiles,
      restoreSessionState
    },
    sessionName,
    setSessionName
  };
} 
"use client";

// Add TypeScript declaration for sessionMonitor
declare global {
  interface Window {
    sessionMonitor?: {
      record: (sessionId: string) => void;
    };
  }
}

import { useState, useRef, useCallback, useEffect } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { usePromptGenerator } from "./use-prompt-generator";
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { useNotification } from '@/lib/contexts/notification-context';
import { useBackgroundJobs, useBackgroundJob } from '@/lib/contexts/background-jobs-context';
import {
  generateGuidanceForPathsAction
} from '@/actions/guidance-generation-actions';
import { Session } from '@/types/session-types';

// Import the new hooks
import { useTaskDescriptionState } from "./use-task-description-state";
import { useFileSelectionState } from "./use-file-selection-state";
import { useRegexState } from "./use-regex-state";

// Constants

// Types
export interface FileInfo {
  path: string;
  size: number;
  included: boolean;
  forceExcluded: boolean;
}

export type OutputFormat = "markdown" | "xml" | "plain";

export function useGeneratePromptState() {
  const { projectDirectory, setProjectDirectory } = useProject();
  const { setActiveSessionId: setSavedSessionId } = useProject();
  const { showNotification } = useNotification();
  useBackgroundJobs();

  // Core form state not in sub-hooks
  const [error, setError] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [isFormSaving, setIsFormSaving] = useState(false);
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);
  const [isCopyingPrompt, setIsCopyingPrompt] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const OUTPUT_FORMAT_PROJECT_KEY = `generate-prompt-output-format-${projectDirectory || 'global'}`;
  const [outputFormat, setOutputFormat] = useLocalStorage<OutputFormat>(OUTPUT_FORMAT_PROJECT_KEY, "markdown");
  const [diffTemperature, setDiffTemperature] = useState<number>(0.9);
  const [sessionName, setSessionName] = useState<string>("Untitled Session");
  const [projectDataLoading, setProjectDataLoading] = useState(false);
  
  // State for custom prompt mode and Gemini
  const [isCustomPromptMode, setIsCustomPromptMode] = useState(false);
  const [showPrompt, setShowPrompt] = useState(true);
  const [customPrompt, setCustomPrompt] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiResponse, setGeminiResponse] = useState("");
  const [isSubmittingToGemini, setIsSubmittingToGemini] = useState(false);
  const [geminiErrorMessage, setGeminiErrorMessage] = useState("");
  
  // State for background job IDs not in sub-hooks
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isStateLoaded, setIsStateLoaded] = useState(false);
  const [isFileSelectionsApplied, setIsFileSelectionsApplied] = useState(false);

  // Refs not in sub-hooks
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSessionId = useRef<string | null>(null);
  
  // Enhanced ref to store current state for saving
  const currentStateRef = useRef<{
    taskDescription: string;
    searchTerm: string;
    pastedPaths: string;
    titleRegex: string;
    contentRegex: string;
    negativeTitleRegex: string;
    negativeContentRegex: string;
    isRegexActive: boolean;
    diffTemperature: number;
    includedFiles: string[];
    forceExcludedFiles: string[];
  }>({
    taskDescription: "",
    searchTerm: "",
    pastedPaths: "",
    titleRegex: "",
    contentRegex: "",
    negativeTitleRegex: "",
    negativeContentRegex: "",
    isRegexActive: true,
    diffTemperature: 0.9,
    includedFiles: [],
    forceExcludedFiles: []
  });

  // Add state for session switching
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);

  // Define common interaction handler
  const handleInteraction = useCallback(() => {
    setHasUnsavedChanges(true);
    
    // Optionally, reset interaction timeout
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
  }, []);

  // Initialize specialized state hooks
  const taskState = useTaskDescriptionState({
    activeSessionId,
    onInteraction: handleInteraction,
    setHasUnsavedChanges
  });
  
  const fileState = useFileSelectionState({
    projectDirectory,
    activeSessionId,
    taskDescription: taskState.taskDescription,
    onInteraction: handleInteraction,
    setHasUnsavedChanges,
    debugMode
  });
  
  const regexState = useRegexState({
    activeSessionId,
    taskDescription: taskState.taskDescription,
    onInteraction: handleInteraction,
    setHasUnsavedChanges
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
  } = usePromptGenerator({
    taskDescription: taskState.taskDescription,
    allFilesMap: fileState.allFilesMap,
    fileContentsMap: fileState.fileContentsMap,
    pastedPaths: fileState.pastedPaths,
    projectDirectory,
    diffTemperature
  });

  // Monitor background jobs
  const findingFilesJob = useBackgroundJob(fileState.findingFilesJobId);
  const regexJob = useBackgroundJob(regexState.generatingRegexJobId);

  // Create reusable methods for component
  const applyFilePaths = useCallback(async (includedPaths: string[], excludedPaths: string[] = []) => {
    if (!includedPaths || includedPaths.length === 0) {
      console.log("[useGeneratePromptState] No paths to apply");
      return { success: false, message: "No paths to apply" };
    }
    
    // Get the allFilesMap from fileState
    const { allFilesMap } = fileState;
    
    // Filter paths to only include ones that exist in the file map
    const validPaths = includedPaths.filter(path => {
      return allFilesMap[path] !== undefined;
    });
    
    if (validPaths.length === 0) {
      console.log("[useGeneratePromptState] No valid paths to apply");
      return { success: false, message: "No valid paths found in the current file map" };
    }
    
    console.log(`[useGeneratePromptState] Applying ${validPaths.length} valid paths`);
    
    // Update file selections in the file map
    const updatedMap = { ...allFilesMap };
    
    // Mark all files as not included first
    Object.keys(updatedMap).forEach(path => {
      updatedMap[path] = {
        ...updatedMap[path],
        included: false
      };
    });
    
    // Then mark only the selected paths as included
    validPaths.forEach(path => {
      if (updatedMap[path]) {
        updatedMap[path] = {
          ...updatedMap[path],
          included: true
        };
      }
    });
    
    // Update the file state - no need to directly set the state since we will call other methods
    try {
      // Update the fileState
      fileState.setFileSelections(updatedMap, validPaths);
      return { 
        success: true, 
        message: `Successfully applied ${validPaths.length} paths out of ${includedPaths.length} total`
      };
    } catch (error) {
      console.error("[useGeneratePromptState] Error applying file paths:", error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error applying file paths" 
      };
    }
  }, [fileState]);

  // Monitor background job status changes and process them
  const checkForBackgroundUpdates = useCallback(async () => {
    // Check for file finder job updates
    if (fileState.findingFilesJobId && findingFilesJob) {
      if (findingFilesJob.status === 'completed' && findingFilesJob.response) {
        // Reset finding files state
        fileState.setIsFindingFiles(false);
        
        try {
          // Parse the response as a newline-separated string of paths
          const paths = findingFilesJob.response
            .split('\n')
            .map(path => path.trim())
            .filter(path => path.length > 0);
          
          console.log(`[useGeneratePromptState] Processing ${paths.length} paths from completed job:`, paths);
          
          // Apply the found paths to file selections
          if (paths.length > 0) {
            // Use the consolidated method to update paths and file selections
            fileState.updatePathsAfterJobCompletion(paths);
            
            showNotification({
              title: "Relevant files found",
              message: `Found ${paths.length} relevant files for your task.`,
              type: "success"
            });
            
            // Mark changes as unsaved
            setHasUnsavedChanges(true);
          } else {
            showNotification({
              title: "No relevant files found",
              message: "No files matched the search criteria. Try a different task description.",
              type: "warning"
            });
          }
          
          // Clear the job ID to prevent reprocessing
          fileState.setFindingFilesJobId(null);
        } catch (error) {
          console.error("[useGeneratePromptState] Error processing found paths:", error);
          
          showNotification({
            title: "Error processing files",
            message: "Failed to process found files. Please try again.",
            type: "error"
          });
          
          // Clear the job ID to prevent reprocessing
          fileState.setFindingFilesJobId(null);
        }
      } else if (findingFilesJob.status === 'failed') {
        fileState.setIsFindingFiles(false);
        fileState.setFindingFilesJobId(null);
        
        showNotification({
          title: "File search failed",
          message: findingFilesJob.errorMessage || "Failed to search for relevant files. Please try again.",
          type: "error"
        });
      }
    }
  
    // Check for regex job updates
    if (regexState.generatingRegexJobId && regexJob) {
      if (regexJob.status === 'completed' && regexJob.response) {
        // Reset generating regex state
        regexState.setIsGeneratingTaskRegex(false);
        
        try {
          // Parse the response regex patterns
          const response = JSON.parse(regexJob.response);
          
          // Apply the regex patterns
          if (response) {
            regexState.applyRegexPatterns({
              titlePattern: response.titlePattern || '',
              contentPattern: response.contentPattern || '',
              negativeTitlePattern: response.negativeTitlePattern || '',
              negativeContentPattern: response.negativeContentPattern || ''
            });
            
            // Set regex active if we got valid patterns
            if (response.titlePattern || response.contentPattern) {
              regexState.setIsRegexActive(true);
              
              showNotification({
                title: "Regex patterns generated",
                message: "Generated regex patterns for your task description.",
                type: "success"
              });
            } else {
              regexState.setIsGeneratingTaskRegex(false);
              setError("Failed to generate regex patterns.");
              
              showNotification({
                title: "Error generating regex",
                message: "Failed to generate regex patterns for your task description.",
                type: "error"
              });
            }
          } else {
            regexState.setIsGeneratingTaskRegex(false);
            setError("Failed to generate regex patterns.");
            
            showNotification({
              title: "Error generating regex",
              message: "Failed to generate regex patterns for your task description.",
              type: "error"
            });
          }
        } catch (error) {
          console.error("[useGeneratePromptState] Error parsing regex patterns:", error);
          regexState.setIsGeneratingTaskRegex(false); 
          setError("Error parsing regex patterns.");
          
          showNotification({
            title: "Error generating regex",
            message: "Failed to parse the generated regex patterns.",
            type: "error"
          });
        }
        
        // Always reset the generatingRegexJobId to null after processing completed status
        regexState.setIsGeneratingTaskRegex(false);
      } else if (regexJob.status === 'failed' || regexJob.status === 'canceled') {
        // Job failed
        regexState.setIsGeneratingTaskRegex(false);
        
        showNotification({
          title: "Error generating regex",
          message: regexJob.errorMessage || "Failed to generate regex patterns for your task description.",
          type: "error"
        });
        
        // Reset the generatingRegexJobId to null after processing failed or canceled status
        regexState.setIsGeneratingTaskRegex(false);
      }
    }
  }, [findingFilesJob, regexJob, fileState, regexState, showNotification, setError]);

  // Ensure the background updates are checked whenever job status changes
  useEffect(() => {
    checkForBackgroundUpdates();
  }, [checkForBackgroundUpdates, findingFilesJob]);

  // Use effect to update the currentStateRef
  useEffect(() => {
    currentStateRef.current = {
      taskDescription: taskState.taskDescription,
      searchTerm: fileState.searchTerm,
      pastedPaths: fileState.pastedPaths,
      titleRegex: regexState.titleRegex,
      contentRegex: regexState.contentRegex,
      negativeTitleRegex: regexState.negativeTitleRegex,
      negativeContentRegex: regexState.negativeContentRegex,
      isRegexActive: regexState.isRegexActive,
      diffTemperature,
      includedFiles: fileState.includedPaths,
      forceExcludedFiles: fileState.excludedPaths
    };
  }, [
    taskState.taskDescription,
    fileState.searchTerm,
    fileState.pastedPaths,
    regexState.titleRegex,
    regexState.contentRegex,
    regexState.negativeTitleRegex,
    regexState.negativeContentRegex,
    regexState.isRegexActive,
    diffTemperature,
    fileState.includedPaths,
    fileState.excludedPaths
  ]);

  // Enhanced useEffect hook to load session state on initialization or when activeSessionId changes
  useEffect(() => {
    // Only proceed if we have a valid activeSessionId
    if (!activeSessionId) {
      console.log(`[useGeneratePromptState] No activeSessionId, resetting state flags. isStateLoaded=${isStateLoaded}, isRestoringSession=${isRestoringSession}, projectDirectory=${projectDirectory}`);
      // Reset the state loaded flag when we don't have an active session
      setIsStateLoaded(false);
      setIsRestoringSession(false);
      return;
    }

    // Explicitly check if this session is the same as previously loaded and if state is already loaded
    // This prevents reloading the same session unnecessarily
    if (isStateLoaded && activeSessionId === prevSessionId.current) {
      console.log(`[useGeneratePromptState] State already loaded for current session: ${activeSessionId}, skipping load`);
      // Ensure restoration flag is reset
      setIsRestoringSession(false);
      return;
    }

    // If we're actively switching sessions, we may want additional handling
    if (isSwitchingSession) {
      console.log(`[useGeneratePromptState] Currently switching to session: ${activeSessionId}`);
      // We don't actually need to do anything here since session data will be loaded via handleLoadSession
    }

    console.log(`[useGeneratePromptState] useEffect for activeSessionId=${activeSessionId}, isStateLoaded=${isStateLoaded}, isRestoringSession=${isRestoringSession}`);
    
    // Note: Session data is now loaded directly by handleLoadSession which is called by SessionManager,
    // so we no longer need to fetch the session data here

    // Create an AbortController for potential cleanup
    const abortController = new AbortController();
    
    // Cleanup function to handle component unmount or session ID changes
    return () => {
      console.log(`[useGeneratePromptState] Cleanup function called for session: ${activeSessionId}`);
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, projectDirectory, taskState, fileState, regexState]);
  /* The boolean state flags (isRestoringSession, isStateLoaded, isSwitchingSession) are intentionally omitted
   * from the dependency array because:
   * 1. They're used as control flags within the effect itself and including them would cause recursive reruns
   * 2. These flags are SET by this effect and then READ by it to control flow, not as actual dependencies
   */

  // Handle setting active session ID
  const handleSetActiveSessionId = (id: string | null) => {
    const timestamp = new Date().toISOString();
    const sequence = Math.random().toString(36).substring(2, 8);
    
    console.log(`[useGeneratePromptState][${sequence}][${timestamp}] 🔄 SET SESSION ID: Changing from ${activeSessionId || 'null'} to ${id || 'null'}`);
    console.log(`[useGeneratePromptState][${sequence}] Current state flags: isStateLoaded=${isStateLoaded}, isRestoringSession=${isRestoringSession}, isSwitchingSession=${isSwitchingSession}, hasUnsavedChanges=${hasUnsavedChanges}`);
    
    // Validate the ID parameter
    if (id !== null && typeof id !== 'string') {
      console.error(`[useGeneratePromptState][${sequence}] ❌ Invalid sessionId type: ${typeof id}, value:`, id);
      return;
    }
    
    // If this is the same session ID and state is already loaded, do nothing
    if (activeSessionId === id && isStateLoaded) {
      console.log(`[useGeneratePromptState][${sequence}] Session ID unchanged (${id}) and state already loaded, no action needed`);
      return;
    }
    
    // Only reset state if the ID actually changed
    if (activeSessionId !== id) {
      console.log(`[useGeneratePromptState][${sequence}] Session ID changed from ${activeSessionId || 'null'} to ${id || 'null'}, preparing for switch`);
      
      // Track the previous session ID before changing
      prevSessionId.current = activeSessionId;
      console.log(`[useGeneratePromptState][${sequence}] Stored previous session ID in ref: ${prevSessionId.current || 'null'}`);
      
      // Reset state flags in a specific order to avoid race conditions
      
      // 1. First set isSwitchingSession to true - this will help the useEffect know we're
      // intentionally changing sessions and not to cancel mid-load
      console.log(`[useGeneratePromptState][${sequence}] Step 1: Setting isSwitchingSession=true`);
      setIsSwitchingSession(true);
      
      // 2. Reset isRestoringSession flag (if active) before any other state changes
      if (isRestoringSession) {
        console.log(`[useGeneratePromptState][${sequence}] Step 2: Resetting isRestoringSession flag before changing session ID`);
        setIsRestoringSession(false);
      } else {
        console.log(`[useGeneratePromptState][${sequence}] Step 2: isRestoringSession already false, no change needed`);
      }
      
      // 3. Reset any error state before new session load
      console.log(`[useGeneratePromptState][${sequence}] Step 3: Clearing error state`);
      setError("");
      
      // 4. IMPORTANT: Reset all form-related state SYNCHRONOUSLY before anything else
      // Use the dedicated reset functions from each sub-hook for complete and consistent reset
      console.log(`[useGeneratePromptState][${sequence}] Step 4: Performing complete state reset with dedicated reset functions`);
      
      // Reset task description state
      console.log(`[useGeneratePromptState][${sequence}] Step 4.1: Resetting taskState`);
      taskState.reset();
      
      // Reset file selection state 
      console.log(`[useGeneratePromptState][${sequence}] Step 4.2: Resetting fileState`);
      fileState.reset();
      
      // Reset regex state
      console.log(`[useGeneratePromptState][${sequence}] Step 4.3: Resetting regexState`);
      regexState.reset();
      
      // Reset other main state variables
      console.log(`[useGeneratePromptState][${sequence}] Step 4.4: Resetting diffTemperature and sessionName`);
      setDiffTemperature(0.7);
      setSessionName("Untitled Session");
      setIsFileSelectionsApplied(false);
      
      // 5. Update the active session ID - this will be a dependency of the useEffect
      console.log(`[useGeneratePromptState][${sequence}] Step 5: Updating activeSessionId=${id || 'null'} and persisting to project context`);
      
      // Update both local state and project context's state in synchronous sequence
      setActiveSessionId(id);
      
      // Update the project context to ensure consistency across the app
      // This ensures the session ID is properly persisted in localStorage via the project context
      setSavedSessionId(id);
      
      // 6. Only AFTER setting the new sessionId, set isStateLoaded to false
      // This ordering helps prevent races where isStateLoaded=false triggers a load
      // before activeSessionId is updated
      console.log(`[useGeneratePromptState][${sequence}] Step 6: Setting isStateLoaded=false to trigger reload`);
      setIsStateLoaded(false);
      
      // 7. Reset unsaved changes after switching
      console.log(`[useGeneratePromptState][${sequence}] Step 7: Resetting hasUnsavedChanges=false`);
      setHasUnsavedChanges(false);
      
      // If we're clearing the session ID, reset form state and isSwitchingSession
      if (!id) {
        console.log(`[useGeneratePromptState][${sequence}] No new session ID, setting sessionInitialized=false and isSwitchingSession=false`);
        setSessionInitialized(false);
        setIsSwitchingSession(false);
      }
      
      console.log(`[useGeneratePromptState][${sequence}][${timestamp}] 🔄 SESSION ID CHANGE COMPLETED`);
    } else {
      // Same session ID, but we want to force a reload
      console.log(`[useGeneratePromptState][${sequence}] Session ID unchanged (${id}), but forcing state reload by setting isStateLoaded=false`);
      
      // If we're reloading the same session, ensure we're in a clean state
      if (isRestoringSession) {
        console.log(`[useGeneratePromptState][${sequence}] Resetting isRestoringSession flag before reloading the same session ID`);
        setIsRestoringSession(false);
      }
      
      // Set switching flag to indicate an intentional reload
      setIsSwitchingSession(true);
      
      // Always set isStateLoaded to false to trigger reload, ensuring clean state
      console.log(`[useGeneratePromptState][${sequence}] Setting isStateLoaded=false to trigger reload`);
      setIsStateLoaded(false);
    }
  };

  // Handle session name change
  const handleSessionNameChange = (name: string) => {
    setSessionName(name);
    handleInteraction();
  };

  // Handle diffTemperature change
  const handleSetDiffTemperature = (value: number) => {
    setDiffTemperature(value);
    handleInteraction();
  };

  // Handle loading a session
  const handleLoadSession = async (sessionData: Session | null) => {
    const timestamp = new Date().toISOString();
    const sequence = Math.random().toString(36).substring(2, 8);
    
    if (!sessionData) {
      // Handle reset logic when null is passed
      console.log(`[useGeneratePromptState][${sequence}][${timestamp}] 🔄 LOAD SESSION: Received null session, resetting session`);
      handleSetActiveSessionId(null);
      return;
    }
    
    // Validate that id is a string
    if (typeof sessionData.id !== 'string' || !sessionData.id.trim()) {
      console.error(`[useGeneratePromptState][${sequence}] ❌ Invalid sessionId type: ${typeof sessionData.id}, value:`, sessionData.id);
      setError("Invalid session ID format");
      return;
    }
    
    console.log(`[useGeneratePromptState][${sequence}][${timestamp}] 🔄 LOAD SESSION STARTED: ${sessionData.id} (${sessionData.name || 'Untitled'})`);
    console.log(`[useGeneratePromptState][${sequence}] Session data summary:`, {
      id: sessionData.id,
      name: sessionData.name,
      taskDescriptionLength: sessionData.taskDescription?.length || 0,
      includedFilesCount: sessionData.includedFiles?.length || 0,
      excludedFilesCount: sessionData.forceExcludedFiles?.length || 0,
      hasRegexPatterns: !!(sessionData.titleRegex || sessionData.contentRegex || sessionData.negativeTitleRegex || sessionData.negativeContentRegex),
      isRegexActive: sessionData.isRegexActive
    });
    
    try {
      // Set restoration flag to indicate we're loading a session
      console.log(`[useGeneratePromptState][${sequence}] Step 1: Setting isRestoringSession=true`);
      setIsRestoringSession(true);
      
      // First update active session ID - this will trigger a complete state reset
      // The reset is performed synchronously via the sub-hook reset functions
      console.log(`[useGeneratePromptState][${sequence}] Step 2: Setting active session ID to ${sessionData.id} (this will reset state)`);
      handleSetActiveSessionId(sessionData.id);
      
      // Now apply the session data directly
      console.log(`[useGeneratePromptState][${sequence}] Step 3: Applying session data for ${sessionData.id}`);
      
      // Update session name if available
      if (sessionData.name) {
        console.log(`[useGeneratePromptState][${sequence}] Step 3.1: Setting session name: "${sessionData.name}"`);
        setSessionName(sessionData.name);
      } else {
        console.log(`[useGeneratePromptState][${sequence}] Session has no name, using default`);
      }
      
      // Update task description if available
      if (sessionData.taskDescription) {
        console.log(`[useGeneratePromptState][${sequence}] Step 3.2: Setting task description (${sessionData.taskDescription.length} chars)`);
        taskState.setTaskDescription(sessionData.taskDescription);
      } else {
        console.log(`[useGeneratePromptState][${sequence}] Session has no task description`);
      }
      
      // Apply regex patterns if available
      const hasRegexPatterns = !!(sessionData.titleRegex || sessionData.contentRegex || sessionData.negativeTitleRegex || sessionData.negativeContentRegex);
      console.log(`[useGeneratePromptState][${sequence}] Step 3.3: Applying regex patterns: title=${!!sessionData.titleRegex}, content=${!!sessionData.contentRegex}, negTitle=${!!sessionData.negativeTitleRegex}, negContent=${!!sessionData.negativeContentRegex}`);
      
      if (hasRegexPatterns) {
        regexState.setTitleRegex(sessionData.titleRegex || '');
        regexState.setContentRegex(sessionData.contentRegex || '');
        regexState.setNegativeTitleRegex(sessionData.negativeTitleRegex || '');
        regexState.setNegativeContentRegex(sessionData.negativeContentRegex || '');
        
        // Set active flag based on session data
        console.log(`[useGeneratePromptState][${sequence}] Step 3.3.1: Setting isRegexActive: ${sessionData.isRegexActive}`);
        regexState.setIsRegexActive(sessionData.isRegexActive === true);
      } else {
        console.log(`[useGeneratePromptState][${sequence}] Session has no regex patterns`);
      }
      
      // Search term
      if (sessionData.searchTerm) {
        console.log(`[useGeneratePromptState][${sequence}] Step 3.4: Setting searchTerm: "${sessionData.searchTerm}"`);
        fileState.setSearchTerm(sessionData.searchTerm);
      }
      
      // Pasted paths
      if (sessionData.pastedPaths) {
        console.log(`[useGeneratePromptState][${sequence}] Step 3.5: Setting pastedPaths (${sessionData.pastedPaths.length} chars)`);
        fileState.setPastedPaths(sessionData.pastedPaths);
      }
      
      // Diff temperature
      if (typeof sessionData.diffTemperature === 'number') {
        console.log(`[useGeneratePromptState][${sequence}] Step 3.6: Setting diffTemperature: ${sessionData.diffTemperature}`);
        setDiffTemperature(sessionData.diffTemperature);
      }
      
      // Set core state flags
      console.log(`[useGeneratePromptState][${sequence}] Step 4: Setting core state flags: sessionInitialized=true, isStateLoaded=true, hasUnsavedChanges=false`);
      setSessionInitialized(true);
      setIsStateLoaded(true);
      setHasUnsavedChanges(false);
      
      // Load files - but only if we have valid file selections and a project directory
      if (projectDirectory && (sessionData.includedFiles?.length || sessionData.forceExcludedFiles?.length)) {
        console.log(`[useGeneratePromptState][${sequence}] Step 5: Loading files for projectDirectory=${projectDirectory} with ${sessionData.includedFiles?.length || 0} included files and ${sessionData.forceExcludedFiles?.length || 0} excluded files`);
        
        const loadedFilesResult = await applyFilePaths(sessionData.includedFiles || [], sessionData.forceExcludedFiles || []);
        if (loadedFilesResult.success) {
          console.log(`[useGeneratePromptState][${sequence}] Step 5.1: Successfully loaded files, setting isFileSelectionsApplied=true`);
          setIsFileSelectionsApplied(true);
        } else {
          console.warn(`[useGeneratePromptState][${sequence}] ⚠️ Warning: Not all file paths could be applied:`, loadedFilesResult.message);
          
          // Still mark the file selections as applied, we did the best we could
          setIsFileSelectionsApplied(true);
        }
      } else {
        console.log(`[useGeneratePromptState][${sequence}] Step 5: No file selections to apply or missing project directory`);
        setIsFileSelectionsApplied(true); // Mark as complete even if there's nothing to do
      }
      
      const endTimestamp = new Date().toISOString();
      console.log(`[useGeneratePromptState][${sequence}][${endTimestamp}] 🔄 LOAD SESSION COMPLETED: ${sessionData.id}`);
      
      // Finally, reset the restoration and switching flags once everything is loaded
      console.log(`[useGeneratePromptState][${sequence}] Step 6: Finalizing session load, setting isRestoringSession=false, isSwitchingSession=false`);
      setIsRestoringSession(false);
      setIsSwitchingSession(false);
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[useGeneratePromptState][${sequence}][${errorTimestamp}] ❌ Error loading session:`, error);
      
      // Reset flags
      setIsRestoringSession(false);
      setIsSwitchingSession(false);
      setIsStateLoaded(true); // Mark as loaded even if there was an error
      
      // Show error
      setError(`Failed to load session: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Handle generating guidance for selected paths
  const handleGenerateGuidance = async () => {
    if (!projectDirectory) {
      showNotification({
        title: "Cannot generate guidance",
        message: "Please select a project directory first.",
        type: "warning"
      });
      return;
    }
    
    if (!taskState.taskDescription.trim()) {
      showNotification({
        title: "Cannot generate guidance",
        message: "Please provide a task description first.",
        type: "warning"
      });
      return;
    }
    
    if (fileState.includedPaths.length === 0) {
      showNotification({
        title: "Cannot generate guidance",
        message: "Please select at least one file to generate guidance for.",
        type: "warning"
      });
      return;
    }
    
    if (isGeneratingGuidance) {
      showNotification({
        title: "Already generating guidance",
        message: "Please wait for the current generation to complete.",
        type: "warning"
      });
      return;
    }
    
    setIsGeneratingGuidance(true);
    
    try {
      showNotification({
        title: "Generating guidance",
        message: "This may take a moment...",
        type: "info"
      });
      
      // Get file contents for the selected paths
      const fileContents: Record<string, string> = {};
      fileState.includedPaths.forEach(path => {
        if (fileState.fileContentsMap[path]) {
          fileContents[path] = fileState.fileContentsMap[path];
        }
      });
      
      // Create a wrapper function that handles the type mismatch
      const generateGuidance = async () => {
        if (!projectDirectory || !activeSessionId) {
          throw new Error("Project directory or active session not set");
        }
        
        // Call the function with the correct parameters
        const result = await generateGuidanceForPathsAction(
          taskState.taskDescription,
          fileState.includedPaths,
          activeSessionId,
          { modelOverride: undefined }  // Optional parameter
        );
        return result;
      };
      
      const result = await generateGuidance();
      
      if (result.isSuccess && result.data) {
        // Append the guidance to the task description
        taskState.taskDescriptionRef.current?.appendText(result.data.guidance);
        
        showNotification({
          title: "Guidance generated",
          message: "Guidance has been added to your task description.",
          type: "success"
        });
      } else {
        throw new Error(result.message || "Failed to generate guidance.");
      }
    } catch (error) {
      console.error("[useGeneratePromptState] Error generating guidance:", error);
      
      showNotification({
        title: "Error generating guidance",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
    } finally {
      setIsGeneratingGuidance(false);
    }
  };

  // Function to save all state at once
  const handleSaveSessionState = async (sessionId: string) => {
    if (!sessionId) return;
    
    setIsFormSaving(true);
    
    try {
      // Get current state from the ref
      const state = currentStateRef.current;
      
      // Save all state in one operation
      await sessionSyncService.updateSessionState(
        sessionId,
        {
          taskDescription: state.taskDescription,
          searchTerm: state.searchTerm,
          pastedPaths: state.pastedPaths,
          titleRegex: state.titleRegex,
          contentRegex: state.contentRegex,
          negativeTitleRegex: state.negativeTitleRegex,
          negativeContentRegex: state.negativeContentRegex,
          isRegexActive: state.isRegexActive,
          diffTemperature: state.diffTemperature,
          includedFiles: state.includedFiles,
          forceExcludedFiles: state.forceExcludedFiles
        }
      );
      
      setHasUnsavedChanges(false);
      console.log(`[useGeneratePromptState] Saved all session state for ${sessionId}`);
    } catch (error) {
      console.error(`[useGeneratePromptState] Error saving session state:`, error);
      
      showNotification({
        title: "Error saving session",
        message: "Failed to save the session state. Please try again.",
        type: "error"
      });
    } finally {
      setIsFormSaving(false);
    }
  };

  // Get current session state (for creating a new session)
  const getCurrentSessionState = () => {
    return {
      taskDescription: taskState.taskDescription,
      searchTerm: fileState.searchTerm,
      pastedPaths: fileState.pastedPaths,
      titleRegex: regexState.titleRegex,
      contentRegex: regexState.contentRegex,
      negativeTitleRegex: regexState.negativeTitleRegex,
      negativeContentRegex: regexState.negativeContentRegex,
      isRegexActive: regexState.isRegexActive,
      diffTemperature,
      includedFiles: fileState.includedPaths,
      forceExcludedFiles: fileState.excludedPaths
    };
  };

  const resetAllState = useCallback(() => {
    const timestamp = new Date().toISOString();
    const sequence = Math.random().toString(36).substring(2, 8);
    
    console.log(`[useGeneratePromptState][${sequence}][${timestamp}] STARTING complete state reset of all hooks`);
    
    // Reset individual state hooks
    console.log(`[useGeneratePromptState][${sequence}] Step 1: Resetting taskState`);
    taskState.reset();
    
    console.log(`[useGeneratePromptState][${sequence}] Step 2: Resetting fileState`);
    fileState.reset();
    
    console.log(`[useGeneratePromptState][${sequence}] Step 3: Resetting regexState`);
    regexState.reset();
    
    // Reset main state
    console.log(`[useGeneratePromptState][${sequence}] Step 4: Resetting main state variables`);
    setDiffTemperature(0.7);
    setSessionName("Untitled Session");
    setIsFileSelectionsApplied(false);
    setError("");
    setIsStateLoaded(false);
    setHasUnsavedChanges(false);
    setSessionInitialized(false);
    setIsRestoringSession(false);
    setIsSwitchingSession(false);
    
    // Clear active session ID last
    console.log(`[useGeneratePromptState][${sequence}] Step 5: Clearing session IDs`);
    setActiveSessionId(null);
    setSavedSessionId(null);
    
    console.log(`[useGeneratePromptState][${sequence}][${timestamp}] COMPLETED complete state reset`);
  }, [fileState, regexState, taskState, setSavedSessionId]);

  // Handler for setting Gemini API key
  const handleSetGeminiApiKey = (key: string) => {
    setGeminiApiKey(key);
  };

  // Handler for submitting to Gemini
  const handleSubmitToGemini = async (prompt: string) => {
    if (!prompt || !geminiApiKey) {
      setGeminiErrorMessage("Missing prompt or API key");
      return;
    }

    setIsSubmittingToGemini(true);
    setGeminiErrorMessage("");

    try {
      // This is a placeholder - in a real implementation this would call an API
      // For now, we'll just simulate a response after a delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      setGeminiResponse("This is a simulated response from Gemini API. In a real implementation, this would be the actual response from the Gemini API.");
    } catch (error) {
      console.error("[useGeneratePromptState] Error submitting to Gemini:", error);
      setGeminiErrorMessage(error instanceof Error ? error.message : "An unknown error occurred");
    } finally {
      setIsSubmittingToGemini(false);
    }
  };

  // Handler for clearing Gemini response
  const handleClearGeminiResponse = () => {
    setGeminiResponse("");
  };

  // Handler for generating codebase (placeholder function)
  const handleGenerateCodebase = async () => {
    showNotification({
      title: "Generate Codebase",
      message: "This feature is not yet implemented",
      type: "info"
    });
    return Promise.resolve();
  };

  return {
    // Session state
    activeSessionId,
    isStateLoaded,
    isSwitchingSession,
    isRestoringSession, 
    sessionInitialized,
    sessionName,
    hasUnsavedChanges,
    isGeneratingGuidance,
    isFormSaving,
    error,
    
    // Form state
    taskState,
    fileState,
    regexState,
    diffTemperature,
    outputFormat,
    
    // Project data
    projectDirectory,
    projectDataLoading,
    
    // Custom prompt and Gemini state
    isCustomPromptMode,
    showPrompt,
    customPrompt,
    geminiApiKey,
    geminiResponse,
    isSubmittingToGemini,
    geminiErrorMessage,
    
    // File selections applied
    isFileSelectionsApplied,
    
    // Action methods
    setActiveSessionId: handleSetActiveSessionId,
    resetAllState,
    setSessionName: handleSessionNameChange,
    setDiffTemperature: handleSetDiffTemperature,
    setOutputFormat,
    handleLoadSession,
    handleGenerateGuidance,
    saveSessionState: handleSaveSessionState,
    getCurrentSessionState,
    setSessionInitialized,
    setHasUnsavedChanges,
    
    // Custom prompt and Gemini methods
    setIsCustomPromptMode,
    setShowPrompt,
    setCustomPrompt,
    handleSetGeminiApiKey,
    handleSubmitToGemini,
    handleClearGeminiResponse,
    handleGenerateCodebase
  };
}
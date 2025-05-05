"use client";

// Add TypeScript declaration for sessionMonitor
declare global {
  interface Window {
    sessionMonitor?: {
      record: (sessionId: string | null, operation?: string, source?: string) => void;
      log?: any[];
      getSessionHistory?: (sessionId: string) => any[];
      getStats?: () => any;
      start?: () => void;
      stop?: () => any[];
    };
  }
}

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { usePromptGenerator } from "./use-prompt-generator";
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { useNotification } from '@/lib/contexts/notification-context';
import { useBackgroundJobs, useBackgroundJob } from '@/lib/contexts/background-jobs-context';
import {
  generateGuidanceForPathsAction
} from '@/actions/guidance-generation-actions';
import { Session } from '@/types/session-types';
import debounce from '@/lib/utils/debounce';

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

export function useGeneratePromptState() {
  const { projectDirectory, setProjectDirectory, activeSessionId: contextActiveSessionId } = useProject();
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
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  // Refs not in sub-hooks
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSessionId = useRef<string | null>(null);
  // Create ref for task description textarea
  const taskDescriptionRef = useRef<HTMLTextAreaElement>(null);
  
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
    searchSelectedFilesOnly: boolean;
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
    forceExcludedFiles: [],
    searchSelectedFilesOnly: false
  });

  // Add state for session switching
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);

  // Function to save all state at once
  const handleSaveSessionState = useCallback(async (sessionId: string, stateToSave?: typeof currentStateRef.current) => {
    if (!sessionId) return;
    
    setIsFormSaving(true);
    
    try {
      // Get state from parameter or from the ref if not provided
      // This allows capturing the state at the exact moment when the save is triggered
      const state = stateToSave || currentStateRef.current;

      const sequence = Math.random().toString(36).substring(2, 8);
      const timestamp = new Date().toISOString();
      
      console.log(`[useGeneratePromptState][${sequence}][${timestamp}] 💾 SAVING SESSION STATE: ${sessionId}`);
      console.log(`[useGeneratePromptState][${sequence}] State summary:`, {
        taskDescriptionLength: state.taskDescription?.length || 0,
        includedFilesCount: state.includedFiles?.length || 0,
        excludedFilesCount: state.forceExcludedFiles?.length || 0,
        hasRegexPatterns: !!(state.titleRegex || state.contentRegex),
        isRegexActive: state.isRegexActive,
        diffTemperature: state.diffTemperature,
        hasSearchTerm: !!state.searchTerm,
        hasPastedPaths: !!state.pastedPaths,
        searchSelectedFilesOnly: state.searchSelectedFilesOnly
      });
      
      // Save all state in one operation with explicit session ID
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
          forceExcludedFiles: state.forceExcludedFiles,
          searchSelectedFilesOnly: state.searchSelectedFilesOnly
        }
      );
      
      setHasUnsavedChanges(false);
      console.log(`[useGeneratePromptState][${sequence}] ✅ Successfully saved session state for ${sessionId}`);
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
  }, [showNotification, setHasUnsavedChanges, setIsFormSaving]);

  // Create a debounced function for saving all state
  const debouncedSaveAllState = useMemo(
    () => debounce((sessionId: string) => {
      if (!sessionId) return;
      
      console.log(`[useGeneratePromptState] Triggering debounced save for session ${sessionId}`);
      
      // Capture the current state at the moment the debounced function is called
      // This ensures we save the state as it was when the save was triggered, not when it executes
      const stateAtTriggerTime = { ...currentStateRef.current };
      
      // Pass the captured state to handleSaveSessionState along with the sessionId
      handleSaveSessionState(sessionId, stateAtTriggerTime);
    }, 1500), // 1.5 second debounce
    [handleSaveSessionState]
  );

  // Define common interaction handler
  const handleInteraction = useCallback(() => {
    setHasUnsavedChanges(true);
    
    // Trigger debounced save when interaction happens
    if (contextActiveSessionId) {
      debouncedSaveAllState(contextActiveSessionId);
    }
    
    // Optionally, reset interaction timeout
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
  }, [contextActiveSessionId, debouncedSaveAllState]);

  // Initialize specialized state hooks
  const taskState = useTaskDescriptionState({
    activeSessionId: contextActiveSessionId,
    onInteraction: handleInteraction,
    setHasUnsavedChanges,
    taskDescriptionRef
  });
  
  const fileState = useFileSelectionState({
    projectDirectory,
    activeSessionId: contextActiveSessionId,
    taskDescription: taskState.taskDescription,
    onInteraction: handleInteraction,
    setHasUnsavedChanges,
    debugMode
  });
  
  const regexState = useRegexState({
    activeSessionId: contextActiveSessionId,
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

  // This function has been removed as file selection application is now handled
  // directly in useFileSelectionState when the file list is loaded
  // This prevents the race condition where file selections were being applied
  // before the file list was fully loaded

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
  
  // Track processed job IDs to prevent duplicate updates 
  // This ref persists between renders to prevent processing jobs multiple times
  const processedJobIdsRef = useRef<Set<string>>(new Set());
  
  // Add a debug flag to control the additional logging
  const DEBUG_FORM_UPDATES = false;
  
  // Get jobs using the hook at the component level
  const { jobs, activeJobs } = useBackgroundJobs();
  
  // Track attempts to process form updates to detect and resolve issues
  const formUpdateAttemptsRef = useRef(0);
  
  // Monitor for completed background jobs and update form fields
  useEffect(() => {
    // Skip processing if we don't have an active session or jobs
    if (!contextActiveSessionId || !jobs || jobs.length === 0) {
      if (DEBUG_FORM_UPDATES) {
        console.debug(`[useGeneratePromptState] Skipping job processing - no active session or no jobs`);
      }
      return;
    }
    
    const updateAttempt = ++formUpdateAttemptsRef.current;
    
    if (DEBUG_FORM_UPDATES) {
      console.debug(`[useGeneratePromptState] Form update check #${updateAttempt}: Checking ${jobs.length} jobs for session ${contextActiveSessionId.substring(0, 8)}...`);
      
      // Analyze job status distribution
      const statusCounts = jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.debug(`[useGeneratePromptState] Jobs by status:`, statusCounts);
      
      // Count potentially relevant jobs that weren't processed yet
      const potentiallyRelevant = jobs.filter(job => 
        job.sessionId === contextActiveSessionId && 
        job.metadata?.targetField && 
        !processedJobIdsRef.current.has(job.id)
      );
      
      if (potentiallyRelevant.length > 0) {
        console.debug(`[useGeneratePromptState] Found ${potentiallyRelevant.length} potentially relevant unprocessed jobs`);
      }
    }
    
    // Filter for jobs that are:
    // 1. Completed (status is 'completed')
    // 2. Belong to the current session
    // 3. Have a targetField in metadata (indicating they should update a form field)
    // 4. Have a response (the content to update the field with)
    // 5. Haven't been processed before (not in processedJobIdsRef)
    const relevantJobs = jobs.filter(job => 
      job.status === 'completed' && 
      job.sessionId === contextActiveSessionId && 
      job.response && 
      job.metadata?.targetField && 
      !processedJobIdsRef.current.has(job.id)
    );
    
    // If no relevant jobs were found, skip processing
    if (relevantJobs.length === 0) {
      if (DEBUG_FORM_UPDATES && updateAttempt % 10 === 0) { // Only log occasionally to avoid spam
        console.debug(`[useGeneratePromptState] No relevant jobs found for form update`);
      }
      return;
    }
    
    // Log relevant jobs for debugging
    if (DEBUG_FORM_UPDATES) {
      console.debug(`[useGeneratePromptState] Found ${relevantJobs.length} jobs that need field updates:`, 
        relevantJobs.map(job => ({
          id: job.id,
          targetField: job.metadata?.targetField,
          responseLength: job.response?.length || 0
        }))
      );
    }
    
    // Process each relevant job to update the appropriate form field
    relevantJobs.forEach(job => {
      const targetField = job.metadata?.targetField as string;
      const response = job.response || '';
      
      console.log(`[useGeneratePromptState] Processing job ${job.id} to update field: ${targetField}`);
      
      // Skip empty responses that would clear fields
      if (!response.trim()) {
        console.warn(`[useGeneratePromptState] Skipping job ${job.id} - empty response for field: ${targetField}`);
        processedJobIdsRef.current.add(job.id); // Mark as processed anyway
        return;
      }
      
      try {
        // Update the appropriate field based on targetField
        switch (targetField) {
          case 'taskDescription':
            taskState.setTaskDescription(response);
            break;
          case 'pastedPaths':
            fileState.setPastedPaths(response);
            break;
          case 'searchTerm':
            fileState.setSearchTerm(response);
            break;
          case 'titleRegex':
            regexState.setTitleRegex(response);
            break;
          case 'contentRegex':
            regexState.setContentRegex(response);
            break;
          case 'negativeTitleRegex':
            regexState.setNegativeTitleRegex(response);
            break;
          case 'negativeContentRegex':
            regexState.setNegativeContentRegex(response);
            break;
          default:
            console.warn(`[useGeneratePromptState] Unknown target field: ${targetField}`);
            processedJobIdsRef.current.add(job.id); // Mark as processed to avoid trying again
            return; // Skip further processing for this job
        }
        
        // Track unsaved changes when form is updated from job
        setHasUnsavedChanges(true);
        
        // Mark this job as processed to prevent reprocessing
        processedJobIdsRef.current.add(job.id);
        
        console.log(`[useGeneratePromptState] Successfully updated ${targetField} from job ${job.id}`);
        
        // Show a notification about the successful update
        showNotification({
          title: "Form updated",
          message: `The ${targetField} field has been updated with AI-generated content.`,
          type: "success"
        });
      } catch (error) {
        console.error(`[useGeneratePromptState] Error processing job ${job.id} for field ${targetField}:`, error);
        
        // Show error notification
        showNotification({
          title: "Error updating form",
          message: `Failed to update ${targetField} field: ${error instanceof Error ? error.message : String(error)}`,
          type: "error"
        });
        
        // Still mark as processed to avoid infinite retries
        processedJobIdsRef.current.add(job.id);
      }
    });
  }, [
    contextActiveSessionId, 
    jobs, 
    taskState, 
    fileState, 
    regexState, 
    showNotification, 
    setHasUnsavedChanges,
    DEBUG_FORM_UPDATES
  ]);

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
      forceExcludedFiles: fileState.excludedPaths,
      searchSelectedFilesOnly: fileState.searchSelectedFilesOnly
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
    fileState.excludedPaths,
    fileState.searchSelectedFilesOnly
  ]);

  // We no longer need to synchronize activeSessionId since we're using contextActiveSessionId directly

  // Simplified useEffect hook to handle state flags when contextActiveSessionId changes
  useEffect(() => {
    // Log the current state
    console.log(`[useGeneratePromptState] useEffect triggered for contextActiveSessionId=${contextActiveSessionId || 'null'}, projectDirectory=${projectDirectory || 'null'}`);
    
    // Only proceed if we have a valid contextActiveSessionId
    if (!contextActiveSessionId) {
      console.log(`[useGeneratePromptState] No contextActiveSessionId, resetting state flags`);
      // Reset the state loaded flag when we don't have an active session
      setIsStateLoaded(false);
      setIsRestoringSession(false);
      return;
    }
    
    // Update the previous session ID reference for future comparisons
    if (contextActiveSessionId !== prevSessionId.current) {
      console.log(`[useGeneratePromptState] Session ID changed from ${prevSessionId.current || 'null'} to ${contextActiveSessionId}`);
      prevSessionId.current = contextActiveSessionId;
    }
    
    // Create an AbortController for potential cleanup
    const abortController = new AbortController();
    
    // Cleanup function to handle component unmount or session ID changes
    return () => {
      console.log(`[useGeneratePromptState] Cleanup function called for session: ${contextActiveSessionId}`);
      abortController.abort();
    };
  }, [contextActiveSessionId, projectDirectory]);
  /* The boolean state flags (isRestoringSession, isStateLoaded, isSwitchingSession) are intentionally omitted
   * from the dependency array because:
   * 1. They're used as control flags within the effect itself and including them would cause recursive reruns
   * 2. These flags are SET by this effect and then READ by it to control flow, not as actual dependencies
   */

  // We no longer need handleSetActiveSessionId since the active session ID is now controlled by the context

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
      console.log(`[useGeneratePromptState][${sequence}][${timestamp}] 🔄 LOAD SESSION: Received null session, no action needed`);
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
      isRegexActive: sessionData.isRegexActive,
      hasSearchTerm: !!sessionData.searchTerm,
      hasPastedPaths: !!sessionData.pastedPaths,
      hasSearchSelectedFilesOnly: typeof sessionData.searchSelectedFilesOnly === 'boolean'
    });
    
    try {
      // No need to verify that incoming session ID matches context's active session ID
      // The SessionManager will have updated the context before calling handleLoadSession
      
      // Step 1: Set switching session flag immediately to prevent other operations
      console.log(`[useGeneratePromptState][${sequence}] Step 1: Setting isSwitchingSession=true`);
      setIsSwitchingSession(true);
      
      // Collect and log debug information about current state
      if (typeof window !== 'undefined' && window.debugSessionState) {
        window.debugSessionState(contextActiveSessionId || 'null');
        console.log(`[useGeneratePromptState][${sequence}] Recorded debug state for current session before switching`);
      }
      
      // Handle record in session monitor if available
      if (typeof window !== 'undefined' && window.sessionMonitor) {
        window.sessionMonitor.record(sessionData.id);
        console.log(`[useGeneratePromptState][${sequence}] Recorded session transition in sessionMonitor`);
      }
      
      // Step 2: Set restoration flag to indicate we're loading a session
      console.log(`[useGeneratePromptState][${sequence}] Step 2: Setting isRestoringSession=true`);
      setIsRestoringSession(true);
      
      // Step 3: First perform a complete reset of all state before applying new state
      console.log(`[useGeneratePromptState][${sequence}] Step 3: Performing complete state reset before session load`);
      
      // Reset all state in a predictable order - this ensures a clean slate for the new session
      console.log(`[useGeneratePromptState][${sequence}] Step 3.1: Resetting taskState`);
      taskState.reset();
      
      console.log(`[useGeneratePromptState][${sequence}] Step 3.2: Resetting fileState`);
      fileState.reset();
      
      console.log(`[useGeneratePromptState][${sequence}] Step 3.3: Resetting regexState`);
      regexState.reset();
      
      console.log(`[useGeneratePromptState][${sequence}] Step 3.4: Resetting other state variables`);
      setDiffTemperature(0.7);
      setSessionName("Untitled Session");
      setHasUnsavedChanges(false);
      
      // Step 4: Apply all session data in a consistent order
      console.log(`[useGeneratePromptState][${sequence}] Step 4: Applying session data for ${sessionData.id}`);
      
      // Update session name if available
      if (sessionData.name) {
        console.log(`[useGeneratePromptState][${sequence}] Step 4.1: Setting session name: "${sessionData.name}"`);
        setSessionName(sessionData.name);
      }
      
      // Update task description if available
      if (sessionData.taskDescription) {
        console.log(`[useGeneratePromptState][${sequence}] Step 4.2: Setting task description (${sessionData.taskDescription.length} chars)`);
        taskState.setTaskDescription(sessionData.taskDescription);
      }
      
      // Apply regex patterns if available
      console.log(`[useGeneratePromptState][${sequence}] Step 4.3: Applying regex patterns`);
      regexState.setTitleRegex(sessionData.titleRegex || '');
      regexState.setContentRegex(sessionData.contentRegex || '');
      regexState.setNegativeTitleRegex(sessionData.negativeTitleRegex || '');
      regexState.setNegativeContentRegex(sessionData.negativeContentRegex || '');
      regexState.setIsRegexActive(sessionData.isRegexActive === true);
      
      // Apply file-related settings
      console.log(`[useGeneratePromptState][${sequence}] Step 4.4: Setting file-related fields`);
      fileState.setSearchTerm(sessionData.searchTerm || '');
      fileState.setPastedPaths(sessionData.pastedPaths || '');
      fileState.setSearchSelectedFilesOnly(sessionData.searchSelectedFilesOnly || false);
      
      // Apply diff temperature if available
      if (typeof sessionData.diffTemperature === 'number') {
        console.log(`[useGeneratePromptState][${sequence}] Step 4.5: Setting diffTemperature: ${sessionData.diffTemperature}`);
        setDiffTemperature(sessionData.diffTemperature);
      }
      
      // Step 5: File selections are now handled automatically by useFileSelectionState
      // when files are loaded after a session change. We no longer need to manually apply file selections
      console.log(`[useGeneratePromptState][${sequence}] Step 5: File selections will be applied by useFileSelectionState after file loading`);
      
      // We can still log the expected selections for debugging purposes
      if (sessionData.includedFiles?.length || sessionData.forceExcludedFiles?.length) {
        console.log(`[useGeneratePromptState][${sequence}] Found ${sessionData.includedFiles?.length || 0} included and ${sessionData.forceExcludedFiles?.length || 0} excluded file paths in session data`);
      } else {
        console.log(`[useGeneratePromptState][${sequence}] No file selections found in session data`);
      }
      
      // Step 6: Set core state flags after all session data has been applied
      console.log(`[useGeneratePromptState][${sequence}] Step 6: Setting final state flags`);
      setSessionInitialized(true);
      setIsStateLoaded(true);
      setHasUnsavedChanges(false);
      
      // Collect debug info after switch to see if any issues
      if (typeof window !== 'undefined' && window.debugSessionState) {
        window.debugSessionState(sessionData.id);
        console.log(`[useGeneratePromptState][${sequence}] Recorded debug state for new session after switching`);
      }
      
      const endTimestamp = new Date().toISOString();
      console.log(`[useGeneratePromptState][${sequence}][${endTimestamp}] 🔄 LOAD SESSION COMPLETED: ${sessionData.id}`);
      
      // Step 7: Finally, reset the restoration and switching flags
      console.log(`[useGeneratePromptState][${sequence}] Step 7: Resetting operation flags`);
      setIsRestoringSession(false);
      setIsSwitchingSession(false);
    } catch (error) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[useGeneratePromptState][${sequence}][${errorTimestamp}] ❌ Error loading session:`, error);
      
      // Reset flags - always ensure we exit the loading state
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
        if (!projectDirectory || !contextActiveSessionId) {
          throw new Error("Project directory or active session not set");
        }
        
        // Call the function with the correct parameters
        const result = await generateGuidanceForPathsAction(
          taskState.taskDescription,
          fileState.includedPaths,
          contextActiveSessionId,
          { modelOverride: undefined }  // Optional parameter
        );
        return result;
      };
      
      const result = await generateGuidance();
      
      if (result.isSuccess && result.data) {
        // Append the guidance to the task description
        if (taskState.taskDescriptionRef.current) {
          const textarea = taskState.taskDescriptionRef.current;
          const currentValue = textarea.value;
          
          // Add a newline if needed, then append the guidance
          const newValue = currentValue + 
            (currentValue && !currentValue.endsWith('\n') ? '\n\n' : '') + 
            result.data.guidance;
          
          // Update the task description
          taskState.setTaskDescription(newValue);
          
          // Set cursor at the end of the text
          setTimeout(() => {
            if (textarea) {
              textarea.focus();
              textarea.setSelectionRange(newValue.length, newValue.length);
            }
          }, 0);
        }
        
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
      forceExcludedFiles: fileState.excludedPaths,
      searchSelectedFilesOnly: fileState.searchSelectedFilesOnly
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
    setError("");
    setIsStateLoaded(false);
    setHasUnsavedChanges(false);
    setSessionInitialized(false);
    setIsRestoringSession(false);
    setIsSwitchingSession(false);
    
    // No need to clear activeSessionId as it's now controlled by the context
    console.log(`[useGeneratePromptState][${sequence}] Step 5: Active session ID is now controlled by the context`);
    
    console.log(`[useGeneratePromptState][${sequence}][${timestamp}] COMPLETED complete state reset`);
  }, [fileState, regexState, taskState]);

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
    activeSessionId: contextActiveSessionId,
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
    
    
    // Action methods
    resetAllState,
    setSessionName: handleSessionNameChange,
    setDiffTemperature: handleSetDiffTemperature,
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
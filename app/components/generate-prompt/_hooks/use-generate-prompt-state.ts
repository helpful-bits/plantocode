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
    debugSessionState?: (sessionId: string) => void;
  }
}

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { usePromptGenerator } from "./use-prompt-generator";
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { useNotification } from '@/lib/contexts/notification-context';
import { useBackgroundJobs, useBackgroundJob } from '@/lib/contexts/background-jobs-context';
import { Session } from '@/types/session-types';
import debounce from '@/lib/utils/debounce';

// Import the hooks
import { useTaskDescriptionState } from "./use-task-description-state";
import { useRegexState } from "./use-regex-state";
import { useGuidanceGeneration } from "./use-guidance-generation";
import { useSessionMetadata } from "./use-session-metadata";

// File management is now handled separately in useFileManagementState
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
  const [isCopyingPrompt, setIsCopyingPrompt] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [projectDataLoading, setProjectDataLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(true);
  
  // Gemini integration hook removed
  
  // State for background job IDs not in sub-hooks
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  // Refs not in sub-hooks
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevSessionId = useRef<string | null>(null);
  // Create ref for task description textarea
  const taskDescriptionRef = useRef<HTMLTextAreaElement>(null);
  
  // Enhanced ref to store current state for saving - removed file-related properties
  const currentStateRef = useRef<{
    taskDescription: string;
    titleRegex: string;
    contentRegex: string;
    negativeTitleRegex: string;
    negativeContentRegex: string;
    isRegexActive: boolean;
    diffTemperature: number;
  }>({
    taskDescription: "",
    titleRegex: "",
    contentRegex: "",
    negativeTitleRegex: "",
    negativeContentRegex: "",
    isRegexActive: true,
    diffTemperature: 0.9
  });

  // Add state for session switching
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);

  // Function to save all state at once, but now it needs to get file state from outside
  const handleSaveSessionState = useCallback(async (
    sessionId: string, 
    stateToSave?: typeof currentStateRef.current,
    fileState?: {
      searchTerm: string;
      pastedPaths: string;
      includedFiles: string[];
      forceExcludedFiles: string[];
      searchSelectedFilesOnly: boolean;
    }
  ) => {
    if (!sessionId) return;
    
    // Set form saving state at the beginning of the save process
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
        hasRegexPatterns: !!(state.titleRegex || state.contentRegex),
        isRegexActive: state.isRegexActive,
        diffTemperature: state.diffTemperature,
        fileState: fileState ? {
          includedFilesCount: fileState.includedFiles?.length || 0,
          excludedFilesCount: fileState.forceExcludedFiles?.length || 0,
          hasSearchTerm: !!fileState.searchTerm,
          hasPastedPaths: !!fileState.pastedPaths,
          searchSelectedFilesOnly: fileState.searchSelectedFilesOnly
        } : 'not provided'
      });
      
      // Save all state in one operation with explicit session ID
      await sessionSyncService.updateSessionState(
        sessionId,
        {
          // Always include project directory if available
          ...(projectDirectory && { projectDirectory }),
          taskDescription: state.taskDescription,
          titleRegex: state.titleRegex,
          contentRegex: state.contentRegex,
          negativeTitleRegex: state.negativeTitleRegex,
          negativeContentRegex: state.negativeContentRegex,
          isRegexActive: state.isRegexActive,
          diffTemperature: state.diffTemperature,
          // Include file state if provided
          ...(fileState && {
            searchTerm: fileState.searchTerm,
            pastedPaths: fileState.pastedPaths,
            includedFiles: fileState.includedFiles,
            forceExcludedFiles: fileState.forceExcludedFiles,
            searchSelectedFilesOnly: fileState.searchSelectedFilesOnly
          })
        }
      );
      
      // Use a slight delay before updating UI state to ensure
      // any in-progress interactions complete first
      setTimeout(() => {
        // Only reset unsaved changes if there haven't been new interactions since save started
        if (sessionId === contextActiveSessionId) {
          setHasUnsavedChanges(false);
          setIsFormSaving(false);
        }
      }, 0);
      
      console.log(`[useGeneratePromptState][${sequence}] ✅ Successfully saved session state for ${sessionId}`);
    } catch (error) {
      console.error(`[useGeneratePromptState] Error saving session state:`, error);
      
      showNotification({
        title: "Error saving session",
        message: "Failed to save the session state. Please try again.",
        type: "error"
      });
      
      setIsFormSaving(false);
    }
  }, [showNotification, setHasUnsavedChanges, setIsFormSaving, contextActiveSessionId, projectDirectory]);

  // Create a debounced function for saving all state
  const debouncedSaveAllState = useMemo(
    () => debounce((
      sessionId: string,
      fileStateGetter?: () => {
        searchTerm: string;
        pastedPaths: string;
        includedFiles: string[];
        forceExcludedFiles: string[];
        searchSelectedFilesOnly: boolean;
      }
    ) => {
      if (!sessionId) return;
      
      console.log(`[useGeneratePromptState] Triggering debounced save for session ${sessionId}`);
      
      // Capture the current state at the moment the debounced function is called
      // This ensures we save the state as it was when the save was triggered, not when it executes
      const stateAtTriggerTime = { ...currentStateRef.current };
      
      // Get file state if a getter was provided
      const fileState = fileStateGetter ? fileStateGetter() : undefined;
      
      // Pass the captured state to handleSaveSessionState along with the sessionId
      handleSaveSessionState(sessionId, stateAtTriggerTime, fileState);
    }, 1500), // 1.5 second debounce
    [handleSaveSessionState]
  );

  // Define common interaction handler - updated to allow passing in a file state getter
  const handleInteraction = useCallback((
    fileStateGetter?: () => {
      searchTerm: string;
      pastedPaths: string;
      includedFiles: string[];
      forceExcludedFiles: string[];
      searchSelectedFilesOnly: boolean;
    }
  ) => {
    // Trigger debounced save when interaction happens
    if (contextActiveSessionId) {
      // Set hasUnsavedChanges once outside the debounce to show saving indicator immediately
      // but avoid additional re-renders within the component lifecycle
      if (!hasUnsavedChanges) {
        setHasUnsavedChanges(true);
      }
      
      // Trigger the debounced save
      debouncedSaveAllState(contextActiveSessionId, fileStateGetter);
    }
    
    // Optionally, reset interaction timeout
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
  }, [contextActiveSessionId, debouncedSaveAllState, hasUnsavedChanges]);
  
  // Initialize session metadata hook
  const sessionMetadata = useSessionMetadata({
    onInteraction: () => handleInteraction(),
    initialDiffTemperature: 0.7,
    initialSessionName: "Untitled Session"
  });
  
  // Custom prompt mode hook removed

  // Initialize specialized state hooks
  const taskState = useTaskDescriptionState({
    activeSessionId: contextActiveSessionId,
    onInteraction: () => handleInteraction(),
    taskDescriptionRef
  });
  
  const regexState = useRegexState({
    activeSessionId: contextActiveSessionId,
    taskDescription: taskState.taskDescription,
    onInteraction: () => handleInteraction()
  });

  // Initialize prompt generator hook - updated to get file info from props
  const {
    prompt,
    tokenCount,
    isGenerating,
    copySuccess,
    error: promptError,
    externalPathWarnings,
    generatePrompt,
    copyPrompt,
    setError: setPromptError,
  } = usePromptGenerator({
    taskDescription: taskState.taskDescription,
    allFilesMap: {}, // This will now come from the separate file management context
    fileContentsMap: {}, // This will now come from the separate file management context
    pastedPaths: "", // This will now come from the separate file management context
    projectDirectory,
    diffTemperature: sessionMetadata.diffTemperature
  });
  
  // Initialize guidance generation hook
  const guidanceGeneration = useGuidanceGeneration({
    projectDirectory,
    taskDescription: taskState.taskDescription,
    includedPaths: [], // This will now come from the separate file management context
    activeSessionId: contextActiveSessionId,
    onInteraction: () => handleInteraction(),
    taskDescriptionRef,
    setTaskDescription: taskState.setTaskDescription
  });

  // Use effect to update the currentStateRef - removed file-related properties
  useEffect(() => {
    currentStateRef.current = {
      taskDescription: taskState.taskDescription,
      titleRegex: regexState.titleRegex,
      contentRegex: regexState.contentRegex,
      negativeTitleRegex: regexState.negativeTitleRegex,
      negativeContentRegex: regexState.negativeContentRegex,
      isRegexActive: regexState.isRegexActive,
      diffTemperature: sessionMetadata.diffTemperature
    };
  }, [
    taskState.taskDescription,
    regexState.titleRegex,
    regexState.contentRegex,
    regexState.negativeTitleRegex,
    regexState.negativeContentRegex,
    regexState.isRegexActive,
    sessionMetadata.diffTemperature
  ]);

  // Basic session ID and project directory change monitoring
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

  // Handle loading a session - simplified to remove file handling
  const handleLoadSession = useCallback(async (sessionData: Session | null) => {
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
      hasRegexPatterns: !!(sessionData.titleRegex || sessionData.contentRegex || sessionData.negativeTitleRegex || sessionData.negativeContentRegex),
      isRegexActive: sessionData.isRegexActive,
      // File state is now logged elsewhere in the file management hooks
    });
    
    try {
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
      
      console.log(`[useGeneratePromptState][${sequence}] Step 3.3: Resetting regexState`);
      regexState.reset();
      
      console.log(`[useGeneratePromptState][${sequence}] Step 3.4: Resetting other state variables`);
      sessionMetadata.reset();
      setHasUnsavedChanges(false);
      
      // Step 4: Apply all session data in a consistent order
      console.log(`[useGeneratePromptState][${sequence}] Step 4: Applying session data for ${sessionData.id}`);
      
      // Update session name if available
      if (sessionData.name) {
        console.log(`[useGeneratePromptState][${sequence}] Step 4.1: Setting session name: "${sessionData.name}"`);
        sessionMetadata.setSessionName(sessionData.name);
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
      
      // Apply diff temperature if available
      if (typeof sessionData.diffTemperature === 'number') {
        console.log(`[useGeneratePromptState][${sequence}] Step 4.5: Setting diffTemperature: ${sessionData.diffTemperature}`);
        sessionMetadata.setDiffTemperature(sessionData.diffTemperature);
      }
      
      // NOTE: File selections are now handled by the FileManagementProvider
      
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
  }, [
    contextActiveSessionId, 
    setError, 
    setIsSwitchingSession, 
    setIsRestoringSession, 
    taskState, 
    regexState, 
    sessionMetadata,
    setHasUnsavedChanges, 
    setSessionInitialized, 
    setIsStateLoaded
  ]);

  // Get current session state (for creating a new session) - simplified to remove file handling
  const getCurrentSessionState = useCallback((
    fileState?: {
      searchTerm: string;
      pastedPaths: string;
      includedFiles: string[];
      forceExcludedFiles: string[];
      searchSelectedFilesOnly: boolean;
    }
  ) => {
    return {
      // Always include project directory if available
      ...(projectDirectory && { projectDirectory }),
      taskDescription: taskState.taskDescription,
      titleRegex: regexState.titleRegex,
      contentRegex: regexState.contentRegex,
      negativeTitleRegex: regexState.negativeTitleRegex,
      negativeContentRegex: regexState.negativeContentRegex,
      isRegexActive: regexState.isRegexActive,
      diffTemperature: sessionMetadata.diffTemperature,
      // Include file state if provided
      ...(fileState && {
        searchTerm: fileState.searchTerm,
        pastedPaths: fileState.pastedPaths,
        includedFiles: fileState.includedFiles,
        forceExcludedFiles: fileState.forceExcludedFiles,
        searchSelectedFilesOnly: fileState.searchSelectedFilesOnly
      })
    };
  }, [
    projectDirectory,
    taskState.taskDescription,
    regexState.titleRegex,
    regexState.contentRegex,
    regexState.negativeTitleRegex,
    regexState.negativeContentRegex,
    regexState.isRegexActive,
    sessionMetadata.diffTemperature
  ]);

  const resetAllState = useCallback(() => {
    const timestamp = new Date().toISOString();
    const sequence = Math.random().toString(36).substring(2, 8);
    
    console.log(`[useGeneratePromptState][${sequence}][${timestamp}] STARTING complete state reset of all hooks`);
    
    // Reset individual state hooks
    console.log(`[useGeneratePromptState][${sequence}] Step 1: Resetting taskState`);
    taskState.reset();
    
    console.log(`[useGeneratePromptState][${sequence}] Step 3: Resetting regexState`);
    regexState.reset();
    
    // Reset main state
    console.log(`[useGeneratePromptState][${sequence}] Step 4: Resetting main state variables`);
    sessionMetadata.reset();
    setError("");
    setIsStateLoaded(false);
    setHasUnsavedChanges(false);
    setSessionInitialized(false);
    setIsRestoringSession(false);
    setIsSwitchingSession(false);
    
    // No need to clear activeSessionId as it's now controlled by the context
    console.log(`[useGeneratePromptState][${sequence}] Step 5: Active session ID is now controlled by the context`);
    
    console.log(`[useGeneratePromptState][${sequence}][${timestamp}] COMPLETED complete state reset`);
  }, [taskState, regexState, sessionMetadata]);

  // Handler for generating codebase (placeholder function)
  const handleGenerateCodebase = useCallback(async () => {
    showNotification({
      title: "Generate Codebase",
      message: "This feature is not yet implemented",
      type: "info"
    });
    return Promise.resolve();
  }, [showNotification]);

  return useMemo(() => ({
    // Session state
    activeSessionId: contextActiveSessionId,
    isStateLoaded,
    isSwitchingSession,
    isRestoringSession, 
    sessionInitialized,
    sessionName: sessionMetadata.sessionName,
    hasUnsavedChanges,
    isGeneratingGuidance: guidanceGeneration.isGeneratingGuidance,
    isFormSaving,
    error,
    
    // Form state
    taskState,
    regexState,
    diffTemperature: sessionMetadata.diffTemperature,
    
    // Project data
    projectDirectory,
    projectDataLoading,
    
    // Prompt state
    prompt,
    tokenCount,
    copySuccess,
    showPrompt,
    
    // Action methods
    resetAllState,
    setSessionName: sessionMetadata.setSessionName,
    setDiffTemperature: sessionMetadata.setDiffTemperature,
    handleLoadSession,
    handleGenerateGuidance: guidanceGeneration.handleGenerateGuidance,
    saveSessionState: handleSaveSessionState,
    getCurrentSessionState,
    setSessionInitialized,
    setHasUnsavedChanges,
    handleInteraction,
    copyPrompt,
    setShowPrompt,
    handleGenerateCodebase
  }), [
    contextActiveSessionId,
    isStateLoaded,
    isSwitchingSession,
    isRestoringSession,
    sessionInitialized,
    sessionMetadata,
    hasUnsavedChanges,
    guidanceGeneration,
    isFormSaving,
    error,
    taskState,
    regexState,
    projectDirectory,
    projectDataLoading,
    prompt,
    tokenCount, 
    copySuccess,
    showPrompt,
    resetAllState,
    handleLoadSession,
    handleSaveSessionState,
    getCurrentSessionState,
    setSessionInitialized,
    setHasUnsavedChanges,
    handleInteraction,
    copyPrompt,
    setShowPrompt,
    handleGenerateCodebase
  ]);
}
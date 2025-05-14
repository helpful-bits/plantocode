"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useProject } from '@core/lib/contexts/project-context';
import { useSessionContext } from '@core/lib/contexts/session-context';
import { usePromptGenerator } from "./use-prompt-generator";
import { useNotification } from '@core/lib/contexts/notification-context';
import { useBackgroundJobs } from '@core/lib/contexts/background-jobs-context';
import { Session } from '@core/types/session-types';

// Import the hooks
import { useTaskDescriptionState } from "./use-task-description-state";
import { useRegexState } from "./use-regex-state";
import { useGuidanceGeneration } from "./use-guidance-generation";
import { useSessionMetadata } from "./use-session-metadata";
import { useImplementationPlanActions } from "./use-implementation-plan-actions";

// Interface for loaded session file preferences
export interface LoadedSessionFilePrefs {
  includedFiles: string[];
  forceExcludedFiles: string[];
  searchTerm: string;
  searchSelectedFilesOnly: boolean;
}

// File management is now handled separately in useFileManagementState
export function useGeneratePromptState() {
  const { projectDirectory } = useProject();
  const { showNotification } = useNotification();
  useBackgroundJobs();

  // Use the SessionContext for session management
  const sessionContext = useSessionContext();

  // Destructure the specific values we need for cleaner code
  const {
    currentSession,
    activeSessionId,
    updateCurrentSessionFields,
    isSessionLoading,
    isSessionModified,
    setSessionModified
  } = sessionContext;

  // Core form state not in sub-hooks
  const [error, setError] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [isFormSaving, setIsFormSaving] = useState(false);
  const [isCopyingPrompt, setIsCopyingPrompt] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);
  const [projectDataLoading, setProjectDataLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(true);
  const [isStateLoaded, setIsStateLoaded] = useState(false);

  // No longer need local state for session file preferences, as FileManagementProvider now gets this directly from SessionContext

  // Refs
  const prevSessionId = useRef<string | null>(null);
  const taskDescriptionRef = useRef<HTMLTextAreaElement>(null);

  // Enhanced ref to store current state for saving - simplified as we're using SessionContext
  // This is now mainly used for tracking the current state for saving operations
  const currentStateRef = useRef<{
    taskDescription: string;
    titleRegex: string;
    contentRegex: string;
    negativeTitleRegex: string;
    negativeContentRegex: string;
    isRegexActive: boolean;
  }>({
    taskDescription: "",
    titleRegex: "",
    contentRegex: "",
    negativeTitleRegex: "",
    negativeContentRegex: "",
    isRegexActive: true
  });

  // Simplified direct save function that leverages SessionContext
  const handleSaveSessionState = useCallback(async (
    sessionId: string,
    stateToSave?: typeof currentStateRef.current
  ) => {
    if (!sessionId) return;

    setIsFormSaving(true);

    try {
      const state = stateToSave || currentStateRef.current;
      const logId = Math.random().toString(36).substring(2, 6);
      console.log(`[useGeneratePromptState:${logId}] Saving session state for ${sessionId}`);

      // No need to manually collect fields - SessionContext already has the current state
      // Just trigger a save directly from the context
      await sessionContext.saveCurrentSession();

      if (sessionId === activeSessionId) {
        setHasUnsavedChanges(false);
      }

      console.log(`[useGeneratePromptState:${logId}] Successfully saved session ${sessionId}`);
    } catch (error) {
      console.error(`[useGeneratePromptState] Error saving session:`, error);

      showNotification({
        title: "Error saving session",
        message: "Failed to save the session state. Please try again.",
        type: "error"
      });
    } finally {
      setIsFormSaving(false);
    }
  }, [
    showNotification,
    sessionContext,
    setHasUnsavedChanges,
    activeSessionId
  ]);

  // Initialize task state and regex state hooks first
  const taskState = useTaskDescriptionState({
    activeSessionId,
    taskDescriptionRef,
    isSwitchingSession: sessionContext.isTransitioningSession,
    onInteraction: () => setHasUnsavedChanges(true) // Will mark changes without immediate save
  });

  // No longer passing onInteraction to regexState
  const regexState = useRegexState({
    activeSessionId,
    taskDescription: taskState.taskDescription, // Now using taskState's internal taskDescription
    isSwitchingSession: sessionContext.isTransitioningSession
  });

  // Function that returns current non-file state
  // CHANGED: TaskDescription now comes from taskState
  const getCurrentSessionState = useCallback(() => {
    return {
      projectDirectory: projectDirectory || "",
      // Now get task description from taskState internal state
      taskDescription: taskState.taskDescription,
      titleRegex: regexState.titleRegex || "",
      contentRegex: regexState.contentRegex || "",
      negativeTitleRegex: regexState.negativeTitleRegex || "",
      negativeContentRegex: regexState.negativeContentRegex || "",
      isRegexActive: regexState.isRegexActive
    };
  }, [
    projectDirectory,
    taskState.taskDescription, // Changed source of truth
    regexState.titleRegex,
    regexState.contentRegex,
    regexState.negativeTitleRegex,
    regexState.negativeContentRegex,
    regexState.isRegexActive
  ]);

  // Simplified interaction handler - only marks session as having changes
  // The actual state updates happen in the individual hooks that call this method
  const handleInteraction = useCallback(() => {
    if (sessionContext.isTransitioningSession || isRestoringSession || !activeSessionId || !sessionInitialized) {
      return;
    }

    // Just mark as having unsaved changes if not already set
    if (!hasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }

    // No need to update the session fields here as they're already updated
    // in the individual hooks (useTaskDescriptionState, useRegexState) via SessionContext
  }, [
    activeSessionId,
    hasUnsavedChanges,
    sessionContext.isTransitioningSession,
    isRestoringSession,
    sessionInitialized,
    setHasUnsavedChanges
  ]);

  // Explicit save function for UI triggers - simplified now that hooks update context directly
  const triggerSave = useCallback(() => {
    if (sessionContext.isTransitioningSession || isRestoringSession || !sessionInitialized || !activeSessionId) {
      return;
    }

    // No need to explicitly update session context fields here
    // The individual hooks (useTaskDescriptionState, useRegexState) are already
    // directly updating the SessionContext when their state changes

    // Just call saveCurrentSession directly - the context already has the latest state
    sessionContext.saveCurrentSession().then(() => {
      setHasUnsavedChanges(false);
    }).catch(error => {
      console.error('[useGeneratePromptState] Error during explicit save:', error);
    });
  }, [
    activeSessionId,
    sessionContext,
    isRestoringSession,
    sessionInitialized,
    setHasUnsavedChanges
  ]);

  // Method to flush pending saves - simplified now that hooks update context directly
  const flushPendingSaves = useCallback(async () => {
    if (!activeSessionId || sessionContext.isTransitioningSession || isRestoringSession || !sessionInitialized) {
      return false;
    }

    if (!hasUnsavedChanges && !isSessionModified) {
      return true; // Nothing to save, consider it a success
    }

    try {
      // No need to explicitly update session context fields here
      // The individual hooks (useTaskDescriptionState, useRegexState) are already
      // directly updating the SessionContext when their state changes

      // Just call flushSaves directly - the context already has the latest state
      const success = await sessionContext.flushSaves();

      if (success) {
        setHasUnsavedChanges(false);
      }

      return success;
    } catch (error) {
      console.error(`[useGeneratePromptState] Error during flush operation:`, error);
      return false;
    }
  }, [
    activeSessionId,
    sessionContext,
    hasUnsavedChanges,
    isSessionModified,
    setHasUnsavedChanges,
    isRestoringSession,
    sessionInitialized
  ]);

  // Initialize session metadata hook
  const sessionMetadata = useSessionMetadata({
    onInteraction: handleInteraction,
    initialSessionName: currentSession?.name || "Untitled Session"
  });

  // No longer need to update regexState.onInteraction since it's been removed
  useEffect(() => {
    if (taskState) {
      // @ts-expect-error - We're updating the callbacks but TypeScript doesn't know these are accessible
      taskState.onInteraction = () => handleInteraction();
    }
  }, [taskState, handleInteraction]);

  // Initialize prompt generator hook
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
    taskDescription: taskState.taskDescription, // Now using taskState's internal state
    allFilesMap: {}, // From separate file management context
    fileContentsMap: {}, // From separate file management context
    pastedPaths: "", // From separate file management context
    projectDirectory
  });

  // Initialize guidance generation hook
  const guidanceGeneration = useGuidanceGeneration({
    projectDirectory,
    taskDescription: taskState.taskDescription, // Now using taskState's internal state
    includedPaths: [], // From separate file management context
    activeSessionId,
    onInteraction: handleInteraction,
    taskDescriptionRef,
    setTaskDescription: taskState.setTaskDescription
  });

  // Initialize implementation plan actions hook
  const implementationPlanActions = useImplementationPlanActions();

  // Update the currentStateRef from internal state hooks for components that still use it
  useEffect(() => {
    // Update the ref with current state values
    currentStateRef.current = {
      taskDescription: taskState.taskDescription,
      titleRegex: regexState.titleRegex || '',
      contentRegex: regexState.contentRegex || '',
      negativeTitleRegex: regexState.negativeTitleRegex || '',
      negativeContentRegex: regexState.negativeContentRegex || '',
      isRegexActive: regexState.isRegexActive
    };
  }, [
    taskState.taskDescription,
    regexState.titleRegex,
    regexState.contentRegex,
    regexState.negativeTitleRegex,
    regexState.negativeContentRegex,
    regexState.isRegexActive
  ]);

  // Session ID and project directory change monitoring
  useEffect(() => {
    if (!activeSessionId) {
      setIsStateLoaded(false);
      setIsRestoringSession(false);
      return;
    }

    if (activeSessionId !== prevSessionId.current) {
      prevSessionId.current = activeSessionId;
    }

    // Cleanup
    return () => {
      // No-op cleanup
    };
  }, [activeSessionId, projectDirectory]);

  // No longer need handleLoadSession function, as FileManagementProvider now gets session data directly from SessionContext

  // Complete state reset
  const resetAllState = useCallback(() => {
    taskState.reset();
    regexState.reset();
    sessionMetadata.reset();

    setError("");
    setIsStateLoaded(false);
    setHasUnsavedChanges(false);
    setSessionInitialized(false);
    setIsRestoringSession(false);
    // No longer need to reset file preferences, as FileManagementProvider now manages this
  }, [taskState, regexState, sessionMetadata]);

  // No longer need handleLoadSessionRef

  // Add a focused effect to extract file preferences when the session changes
  // Track the session ID to avoid re-processing the same session multiple times
  const processedSessionIdRef = useRef<string | null>(null);

  // No longer need effect to extract file preferences, as FileManagementProvider now does this directly

  // UI update effect - separated from session loading logic to prevent loops
  // Track sessions that have been synchronized to prevent re-syncing
  const syncedSessionIdRef = useRef<string | null>(null);

  // UI update effect - only updates metadata, no longer updates regex state
  useEffect(() => {
    // Skip for empty sessions or when transitioning
    if (!sessionContext.currentSession || sessionContext.isTransitioningSession || isRestoringSession) {
      return;
    }

    const currentSessionData = sessionContext.currentSession;
    if (!currentSessionData) return;

    // Only sync UI for new sessions or when explicitly forced
    if (syncedSessionIdRef.current !== currentSessionData.id) {
      console.log(`[useGeneratePromptState:uiSync] Syncing metadata for session ${currentSessionData.id}`);

      // Update the ref to prevent re-syncing the same session
      syncedSessionIdRef.current = currentSessionData.id;

      // IMPORTANT: We're NOT updating taskState here anymore
      // taskState will update itself from sessionContext via its own useEffect

      // Only update session name which doesn't cause circular dependency
      if (currentSessionData.name !== undefined) {
        sessionMetadata.setSessionName(currentSessionData.name);
      }

      // No longer need to update regex state here since it now reads directly from context
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // We're intentionally using sessionContext.currentSession in the condition but not the deps array
    // to avoid re-running this effect on every taskDescription/content change
    // Instead, we use sessionContext.currentSession?.id as a more stable identifier
    sessionContext.currentSession?.id,
    sessionContext.isTransitioningSession,
    isRestoringSession,
    sessionMetadata
  ]);

  // Handler for generating codebase (placeholder function)
  const handleGenerateCodebase = useCallback(async () => {
    showNotification({
      title: "Generate Codebase",
      message: "This feature is not yet implemented",
      type: "info"
    });
    return Promise.resolve();
  }, [showNotification]);

  // Return the state and methods
  return useMemo(() => ({
    // Session state
    activeSessionId,
    isStateLoaded,
    isSwitchingSession: sessionContext.isTransitioningSession,
    isRestoringSession,
    sessionInitialized,
    sessionName: currentSession?.name || sessionMetadata.sessionName,
    hasUnsavedChanges: isSessionModified || hasUnsavedChanges,
    isGeneratingGuidance: guidanceGeneration.isGeneratingGuidance,
    isFormSaving: isSessionLoading || isFormSaving,
    error,

    // Form state
    // Now taskState manages its own taskDescription internally
    taskState,
    regexState,

    // Project data
    projectDirectory,
    projectDataLoading,

    // Prompt state
    prompt,
    tokenCount,
    copySuccess,
    showPrompt,

    // Implementation plan state from dedicated hook
    isCreatingPlan: implementationPlanActions.isCreatingPlan,
    planCreationState: implementationPlanActions.planCreationState,
    isCopyingPlanPrompt: implementationPlanActions.isCopyingPlanPrompt,
    isEstimatingTokens: implementationPlanActions.isEstimatingTokens,
    estimatedTokens: implementationPlanActions.estimatedTokens,

    // Action methods
    resetAllState,
    setSessionName: sessionMetadata.setSessionName,
    handleGenerateGuidance: guidanceGeneration.handleGenerateGuidance,
    saveSessionState: handleSaveSessionState,
    flushPendingSaves,
    triggerSave,
    getCurrentSessionState,
    setSessionInitialized,
    setHasUnsavedChanges,
    handleInteraction,
    copyPrompt,
    setShowPrompt,
    handleGenerateCodebase,
    handleCreateImplementationPlan: (taskDescription: string, includedPaths: string[]) =>
      implementationPlanActions.handleCreateImplementationPlan(taskDescription, includedPaths),
    handleCopyImplementationPlanPrompt: (taskDescription: string, includedPaths: string[]) =>
      implementationPlanActions.handleCopyImplementationPlanPrompt(taskDescription, includedPaths),
    handleGetImplementationPlanPrompt: (taskDescription: string, includedPaths: string[]) =>
      implementationPlanActions.handleGetImplementationPlanPrompt(taskDescription, includedPaths),
    handleEstimatePlanTokens: (taskDescription: string, includedPaths: string[]) =>
      implementationPlanActions.handleEstimatePlanTokens(taskDescription, includedPaths)
  }), [
    activeSessionId,
    isStateLoaded,
    sessionContext.isTransitioningSession,
    isRestoringSession,
    sessionInitialized,
    currentSession,
    sessionMetadata,
    hasUnsavedChanges,
    isSessionModified,
    guidanceGeneration,
    isFormSaving,
    isSessionLoading,
    error,
    taskState,
    regexState,
    projectDirectory,
    projectDataLoading,
    prompt,
    tokenCount,
    copySuccess,
    showPrompt,
    implementationPlanActions,
    resetAllState,
    handleSaveSessionState,
    flushPendingSaves,
    triggerSave,
    getCurrentSessionState,
    setSessionInitialized,
    setHasUnsavedChanges,
    handleInteraction,
    copyPrompt,
    setShowPrompt,
    handleGenerateCodebase
  ]);
}
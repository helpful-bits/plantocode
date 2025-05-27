"use client";

import { useCallback, useMemo } from "react";

import { type useNotification } from "@/contexts/notification-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";

import { useGenerateFormState } from "./use-generate-form-state";
import { useSessionMetadata } from "./use-session-metadata";
import { createGenerateDirectoryTreeJobAction } from "@/actions/file-system/directory-tree.actions";


export interface UseGeneratePromptCoreStateProps {
  projectDirectory: string | null;
  showNotification: ReturnType<typeof useNotification>["showNotification"];
}

/**
 * Core state management hook for the generate prompt feature
 * This hook is now focused only on core UI state and form coordination,
 * with specific state like task description and regex patterns managed by their own hooks
 */
export function useGeneratePromptCoreState({
  projectDirectory,
  showNotification,
}: UseGeneratePromptCoreStateProps) {
  // Access global session context
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();

  // Create refs for tracking session state management - not currently used but reserved for future state tracking

  // Extract session data from global context
  const { activeSessionId, currentSession, isSessionLoading, isSessionModified } = sessionState;
  const currentSessionName = currentSession?.name || "Untitled Session";

  // Initialize form state hooks
  const formState = useGenerateFormState({
    activeSessionId,
    isTransitioningSession: sessionState.isSessionLoading,
    projectDirectory,
  });

  // Initialize session metadata hook
  const sessionMetadata = useSessionMetadata({
    onInteraction: () => sessionActions.setSessionModified(true),
    initialSessionName: currentSessionName,
  });

  // Create a function to get the current session state
  // All fields are sourced consistently from currentSession if available, applying defaults only if currentSession itself or its properties are null/undefined
  const getCurrentSessionState = useCallback(() => {
    const baseState = {
      projectDirectory: projectDirectory || "",
      taskDescription: "",
      titleRegex: "",
      contentRegex: "",
      negativeTitleRegex: "",
      negativeContentRegex: "",
      isRegexActive: true,
      searchTerm: "",
      includedFiles: [],
      forceExcludedFiles: [],
      searchSelectedFilesOnly: false,
      codebaseStructure: "",
      createdAt: Date.now(),
      modelUsed: undefined,
    };

    if (!currentSession) {
      return baseState;
    }

    // When currentSession exists, merge with defaults
    return {
      ...baseState,
      taskDescription: currentSession.taskDescription || "",
      titleRegex: currentSession.titleRegex || "",
      contentRegex: currentSession.contentRegex || "",
      negativeTitleRegex: currentSession.negativeTitleRegex || "",
      negativeContentRegex: currentSession.negativeContentRegex || "",
      isRegexActive: currentSession.isRegexActive ?? true,
      searchTerm: currentSession.searchTerm || "",
      includedFiles: currentSession.includedFiles || [],
      forceExcludedFiles: currentSession.forceExcludedFiles || [],
      searchSelectedFilesOnly: currentSession.searchSelectedFilesOnly ?? false,
      codebaseStructure: currentSession.codebaseStructure || "",
      createdAt: currentSession.createdAt || Date.now(),
      modelUsed: currentSession.modelUsed,
    };
  }, [currentSession, projectDirectory]);

  // Complete state reset function
  const resetAllState = useCallback(() => {
    sessionMetadata.reset();
    formState.resetFormState();

    // Update session context with reset state
    if (activeSessionId) {
      sessionActions.updateCurrentSessionFields({
        taskDescription: "",
        titleRegex: "",
        contentRegex: "",
        negativeTitleRegex: "",
        negativeContentRegex: "",
        isRegexActive: true,
      });
    }
  }, [
    sessionMetadata,
    formState,
    activeSessionId,
    sessionActions,
  ]);

  // Handler for generating a directory tree for the current project
  const handleGenerateCodebase = async () => {
    if (!projectDirectory) {
      showNotification({
        title: "Generate Codebase",
        message: "Select a project directory first",
        type: "error",
      });
      return;
    }

    const result = await createGenerateDirectoryTreeJobAction("system", projectDirectory, undefined);
    if (!result.isSuccess || !result.data?.jobId) {
      showNotification({
        title: "Error",
        message: result.message || "Failed to start generation",
        type: "error",
      });
    } else {
      showNotification({
        title: "Success", 
        message: "Generation started",
        type: "success",
      });
    }
  };

  // Simplified handler for user interaction that modifies session
  const handleInteraction = useCallback(() => {
    sessionActions.setSessionModified(true);
  }, [sessionActions]);

  return useMemo(
    () => ({
      // Session state
      activeSessionId,
      isStateLoaded: formState.isStateLoaded,
      isSwitchingSession: sessionState.isSessionLoading,
      isRestoringSession: formState.isRestoringSession,
      sessionInitialized: formState.sessionInitialized,
      sessionName: currentSessionName,
      hasUnsavedChanges: isSessionModified,
      isFormSaving: isSessionLoading || formState.isFormSaving,
      isSessionFormLoading: isSessionLoading,
      error: formState.error,

      // Project data
      projectDirectory,
      projectDataLoading: formState.projectDataLoading,

      // Action methods
      resetAllState,
      setSessionName: sessionMetadata.setSessionName,
      saveSessionState: () => sessionActions.saveCurrentSession(),
      flushPendingSaves: () => sessionActions.flushSaves(),
      getCurrentSessionState,
      setSessionInitialized: formState.setSessionInitialized,
      setHasUnsavedChanges: (value: boolean) =>
        sessionActions.setSessionModified(value),
      handleInteraction,
      handleGenerateCodebase,
    }),
    [
      // Core session state
      activeSessionId,
      sessionState.isSessionLoading,
      currentSessionName,
      isSessionModified,
      isSessionLoading,
      
      // Form state
      formState.isStateLoaded,
      formState.isRestoringSession,
      formState.sessionInitialized,
      formState.isFormSaving,
      formState.error,
      formState.projectDataLoading,
      formState.setSessionInitialized,
      
      // Project
      projectDirectory,
      
      // Actions and callbacks
      resetAllState,
      sessionMetadata.setSessionName,
      sessionActions,
      getCurrentSessionState,
      handleInteraction,
      handleGenerateCodebase,
    ]
  );
}
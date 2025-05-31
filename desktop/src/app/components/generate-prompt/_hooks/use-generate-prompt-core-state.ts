"use client";

import { useCallback, useMemo } from "react";

import { type useNotification } from "@/contexts/notification-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";

import { useGenerateFormState } from "./use-generate-form-state";
import { generateDirectoryTreeAction } from "@/actions/file-system/directory-tree.actions";


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



  // Complete state reset function
  const resetAllState = useCallback(() => {
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
    formState.resetFormState,
    activeSessionId,
    sessionActions.updateCurrentSessionFields,
  ]);

  // Handler for generating a directory tree for the current project
  const handleGenerateCodebase = useCallback(async () => {
    if (!projectDirectory) {
      showNotification({
        title: "Generate Codebase",
        message: "Select a project directory first",
        type: "error",
      });
      return;
    }

    try {
      const result = await generateDirectoryTreeAction(projectDirectory);
      if (result.isSuccess && result.data?.directoryTree) {
        // Update the session with the generated directory tree
        if (activeSessionId) {
          sessionActions.updateCurrentSessionFields({
            codebaseStructure: result.data.directoryTree,
          });
        }
        showNotification({
          title: "Success", 
          message: "Directory tree generated successfully",
          type: "success",
        });
      } else {
        showNotification({
          title: "Error",
          message: result.message || "Failed to generate directory tree",
          type: "error",
        });
      }
    } catch (error) {
      showNotification({
        title: "Error",
        message: "Failed to generate directory tree",
        type: "error",
      });
    }
  }, [projectDirectory, showNotification, activeSessionId, sessionActions.updateCurrentSessionFields]);

  // Simplified handler for user interaction that modifies session
  const handleInteraction = useCallback(() => {
    sessionActions.setSessionModified(true);
  }, [sessionActions.setSessionModified]);

  // Memoized inline functions to prevent re-creation
  const setSessionName = useCallback(
    (name: string) => sessionActions.updateCurrentSessionFields({ name }),
    [sessionActions.updateCurrentSessionFields]
  );

  const saveSessionState = useCallback(
    async () => { await sessionActions.saveCurrentSession(); },
    [sessionActions.saveCurrentSession]
  );

  const flushPendingSaves = useCallback(
    async () => { await sessionActions.flushSaves(); return true; },
    [sessionActions.flushSaves]
  );

  const setHasUnsavedChanges = useCallback(
    (value: boolean) => sessionActions.setSessionModified(value),
    [sessionActions.setSessionModified]
  );

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
      setSessionName,
      saveSessionState,
      flushPendingSaves,
      setSessionInitialized: formState.setSessionInitialized,
      setHasUnsavedChanges,
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
      
      // Form state (primitive values and stable setters)
      formState.isStateLoaded,
      formState.isRestoringSession,
      formState.sessionInitialized,
      formState.isFormSaving,
      formState.error,
      formState.projectDataLoading,
      // formState.setSessionInitialized removed - stable setter from useState
      
      // Project
      projectDirectory,
      
      // Actions and callbacks (memoized functions)
      resetAllState,
      setSessionName,
      saveSessionState,
      flushPendingSaves,
      formState.setSessionInitialized,
      setHasUnsavedChanges,
      handleInteraction,
      handleGenerateCodebase,
    ]
  );
}
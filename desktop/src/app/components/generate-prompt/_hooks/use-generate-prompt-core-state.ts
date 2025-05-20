"use client";

import { useCallback } from "react";

import { type useNotification } from "@/contexts/notification-context";
import {
  useSessionStateContext,
  useSessionActionsContext,
} from "@/contexts/session";

import { useGenerateFormState } from "./use-generate-form-state";
import { useSessionMetadata } from "./use-session-metadata";
import { generateDirectoryTree } from "@/utils/directory-tree";

// Import type properly
import type { TaskDescriptionHandle } from "../_components/task-description";

export interface UseGeneratePromptCoreStateProps {
  projectDirectory: string | null;
  activeSessionId: string | null;
  isTransitioningSession: boolean;
  isSessionLoading?: boolean;
  showNotification: ReturnType<typeof useNotification>["showNotification"];
  taskDescriptionRef: React.RefObject<TaskDescriptionHandle>;
  resetTaskState?: () => void;
  resetRegexState?: () => void;
}

/**
 * Core state management hook for the generate prompt feature
 * This hook is now focused only on core UI state and form coordination,
 * with specific state like task description and regex patterns managed by their own hooks
 */
export function useGeneratePromptCoreState({
  projectDirectory,
  activeSessionId,
  isTransitioningSession,
  showNotification,
  resetTaskState,
  resetRegexState,
}: UseGeneratePromptCoreStateProps) {
  // Access global session context
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();

  // Create refs for tracking session state management - not currently used but reserved for future state tracking

  // Extract session data from global context
  const currentSession = sessionState.currentSession;
  const isSessionLoading = sessionState.isSessionLoading;
  const isSessionModified = sessionState.isSessionModified;
  const currentSessionName = currentSession?.name || "Untitled Session";

  // Initialize form state hooks
  const formState = useGenerateFormState({
    activeSessionId,
    isTransitioningSession,
    projectDirectory,
  });

  // Initialize session metadata hook
  const sessionMetadata = useSessionMetadata({
    onInteraction: () => sessionActions.setSessionModified(true),
    initialSessionName: currentSessionName,
  });

  // Create a function to get the current session state
  // This now relies on the global session context rather than managing state locally
  const getCurrentSessionState = useCallback(() => {
    return {
      taskDescription: currentSession?.taskDescription || "",
      titleRegex: currentSession?.titleRegex || "",
      contentRegex: currentSession?.contentRegex || "",
      negativeTitleRegex: currentSession?.negativeTitleRegex || "",
      negativeContentRegex: currentSession?.negativeContentRegex || "",
      isRegexActive: currentSession?.isRegexActive ?? true,
    };
  }, [currentSession]);

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

    // Reset task and regex states if provided
    if (resetTaskState) resetTaskState();
    if (resetRegexState) resetRegexState();
  }, [
    sessionMetadata,
    formState,
    resetTaskState,
    resetRegexState,
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

    const jobId = await generateDirectoryTree(projectDirectory);
    if (!jobId) {
      showNotification({
        title: "Generate Codebase",
        message: "Failed to start directory tree generation",
        type: "error",
      });
    } else {
      showNotification({
        title: "Generate Codebase",
        message: "Directory tree generation started",
        type: "success",
      });
    }
  };

  // Simplified handler for user interaction that modifies session
  const handleInteraction = useCallback(() => {
    sessionActions.setSessionModified(true);
  }, [sessionActions]);

  return {
    // Session state
    activeSessionId,
    isStateLoaded: formState.isStateLoaded,
    isSwitchingSession: isTransitioningSession,
    isRestoringSession: formState.isRestoringSession,
    sessionInitialized: formState.sessionInitialized,
    sessionName: currentSessionName,
    hasUnsavedChanges: isSessionModified,
    isFormSaving: isSessionLoading || formState.isFormSaving,
    error: formState.error,

    // Project data
    projectDirectory,
    projectDataLoading: formState.projectDataLoading,

    // Action methods
    resetAllState,
    setSessionName: (name: string) =>
      sessionActions.updateCurrentSessionFields({ name }),
    saveSessionState: () => sessionActions.saveCurrentSession(),
    flushPendingSaves: () => sessionActions.flushSaves(),
    getCurrentSessionState,
    setSessionInitialized: formState.setSessionInitialized,
    setHasUnsavedChanges: (value: boolean) =>
      sessionActions.setSessionModified(value),
    handleInteraction,
    handleGenerateCodebase,
  };
}
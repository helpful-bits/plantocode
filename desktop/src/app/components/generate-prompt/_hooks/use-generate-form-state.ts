"use client";

import { useState, useCallback, useEffect } from "react";

export interface UseGenerateFormStateProps {
  activeSessionId: string | null;
  isTransitioningSession: boolean;
  projectDirectory: string | null;
}

export interface GenerateFormState {
  // Form lifecycle states
  error: string;
  hasUnsavedChanges: boolean;
  sessionInitialized: boolean;
  isRestoringSession: boolean;
  isFormSaving: boolean;
  projectDataLoading: boolean;
  isStateLoaded: boolean;

  // Form lifecycle methods
  setError: (error: string) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  setSessionInitialized: (initialized: boolean) => void;
  setIsRestoringSession: (isRestoring: boolean) => void;
  setIsFormSaving: (isSaving: boolean) => void;
  setProjectDataLoading: (isLoading: boolean) => void;
  setIsStateLoaded: (isLoaded: boolean) => void;

  // Form operations
  resetFormState: () => void;
}

/**
 * Hook for managing form lifecycle state
 *
 * This hook centralizes the state management related to the form's
 * lifecycle, including loading, saving, initialization, and error states.
 */
export function useGenerateFormState({
  activeSessionId,
  isTransitioningSession,
  projectDirectory,
}: UseGenerateFormStateProps): GenerateFormState {
  // Form state
  const [error, setError] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [sessionInitialized, setSessionInitialized] = useState<boolean>(false);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(false);
  const [isFormSaving, setIsFormSaving] = useState<boolean>(false);
  const [projectDataLoading, setProjectDataLoading] = useState<boolean>(false);
  const [isStateLoaded, setIsStateLoaded] = useState<boolean>(false);

  // Reset all lifecycle state
  const resetFormState = useCallback(() => {
    setError("");
    setHasUnsavedChanges(false);
    setSessionInitialized(false);
    setIsRestoringSession(false);
    setIsFormSaving(false);
    setIsStateLoaded(false);
  }, []);

  // Handle session/project changes
  useEffect(() => {
    if (!activeSessionId || isTransitioningSession) {
      // Reset relevant states when no active session or during transition
      setIsStateLoaded(false);
      setIsRestoringSession(false);
      setSessionInitialized(false); // Explicitly set to false
    } else if (activeSessionId && !isTransitioningSession) {
      // Session is active and not transitioning
      setSessionInitialized(true);
      // setIsStateLoaded might be set after session data is fully loaded
    }
  }, [activeSessionId, isTransitioningSession, projectDirectory]);

  return {
    // States
    error,
    hasUnsavedChanges,
    sessionInitialized,
    isRestoringSession,
    isFormSaving,
    projectDataLoading,
    isStateLoaded,

    // Setters
    setError,
    setHasUnsavedChanges,
    setSessionInitialized,
    setIsRestoringSession,
    setIsFormSaving,
    setProjectDataLoading,
    setIsStateLoaded,

    // Operations
    resetFormState,
  };
}

"use client";

import { useState, useCallback, useEffect } from "react";
import { type FormLifecycleStatus } from "../_contexts/_types/generate-prompt-core-types";

export interface UseGenerateFormStateProps {
  activeSessionId: string | null;
  isTransitioningSession: boolean;
  projectDirectory: string | null;
}

export interface GenerateFormState {
  // Form lifecycle states
  error: string;
  hasUnsavedChanges: boolean;
  lifecycleStatus: FormLifecycleStatus;
  isFormSaving: boolean;
  projectDataLoading: boolean;
  isStateLoaded: boolean;

  // Form lifecycle methods
  setError: (error: string) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  setLifecycleStatus: (status: FormLifecycleStatus) => void;
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
  const [lifecycleStatus, setLifecycleStatus] = useState<FormLifecycleStatus>('IDLE');
  const [isFormSaving, setIsFormSaving] = useState<boolean>(false);
  const [projectDataLoading, setProjectDataLoading] = useState<boolean>(false);
  const [isStateLoaded, setIsStateLoaded] = useState<boolean>(false);

  // Reset all lifecycle state
  const resetFormState = useCallback(() => {
    setError("");
    setHasUnsavedChanges(false);
    setLifecycleStatus('IDLE');
    setIsFormSaving(false);
    setIsStateLoaded(false);
  }, []);

  // Handle session/project changes
  useEffect(() => {
    if (!activeSessionId || isTransitioningSession) {
      // Reset relevant states when no active session or during transition
      setIsStateLoaded(false);
      setLifecycleStatus('IDLE');
    } else if (activeSessionId && !isTransitioningSession) {
      // Session is active and not transitioning
      setLifecycleStatus('READY');
      // setIsStateLoaded might be set after session data is fully loaded
    }
  }, [activeSessionId, isTransitioningSession, projectDirectory]);

  return {
    // States
    error,
    hasUnsavedChanges,
    lifecycleStatus,
    isFormSaving,
    projectDataLoading,
    isStateLoaded,

    // Setters
    setError,
    setHasUnsavedChanges,
    setLifecycleStatus,
    setIsFormSaving,
    setProjectDataLoading,
    setIsStateLoaded,

    // Operations
    resetFormState,
  };
}

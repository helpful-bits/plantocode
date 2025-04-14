"use client";

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Session } from '@/types';
import { useDatabase } from '@/lib/contexts/database-context';

interface FormStateManagerProps {
  activeSessionId: string | null;
  projectDirectory: string;
  outputFormat: string;
  formState: Omit<Session, 'id' | 'name' | 'updatedAt'>; // The current state of the form (excluding generated/metadata fields)
  onStateChange?: (hasChanges: boolean) => void; // Notify parent about change status
  onSaveError?: (error: string | null) => void; // Callback for save errors
  children: React.ReactNode;
}

const FormStateManager: React.FC<FormStateManagerProps> = ({
  activeSessionId,
  projectDirectory,
  outputFormat,
  formState,
  onStateChange,
  onSaveError,
  children,
}) => {
  const { repository } = useDatabase();
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedStateRef = useRef<Omit<Session, 'id' | 'name' | 'updatedAt'> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false); // Prevent concurrent saves

  // Log the received formState prop on every render
  console.log('[FormStateManager] Render - Received formState prop:', formState);

  // Memoize the form state string representation for dependency array
  const formStateString = useMemo(() => JSON.stringify(formState), [formState]);

  // Initialize lastSavedStateRef ONLY when the activeSessionId changes (new session loaded/created)
  useEffect(() => {
    if (activeSessionId) {
      lastSavedStateRef.current = { ...formState }; // Initialize on session load
      console.log(`[FormStateManager] Initialized lastSavedStateRef for session ${activeSessionId}`);
      setSaveError(null); // Clear error when session changes
    }
  }, [activeSessionId, repository]);

  // Debounced auto-save effect - uses formStateString and formState as dependencies
  useEffect(() => {
    if (!activeSessionId || !lastSavedStateRef.current || isSavingRef.current) return;

    // Compare current state with the last known state for this session
    const hasChanges = JSON.stringify(formState) !== JSON.stringify(lastSavedStateRef.current);
    if (onStateChange) onStateChange(hasChanges);

    // Debugging log to see if changes are detected
    if (hasChanges) { // This block should execute if the formState prop changes significantly
      console.log(`[FormStateManager] Detected changes for session ${activeSessionId}. Scheduling auto-save.`);
    }

    if (hasChanges) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(async () => {
        if (!activeSessionId || isSavingRef.current) return; // Double-check
         isSavingRef.current = true; // Set saving flag
        console.log(`[FormStateManager] Auto-saving changes for session ${activeSessionId}...`);
        try {
          const sessionToSave = await repository.getSession(activeSessionId);
          if (sessionToSave) {
            // Ensure all fields from formState overwrite existing session fields correctly
            const updatedSessionData: Session = {
              ...sessionToSave, // Start with existing session data
              ...formState,     // Overwrite with current form state
              id: activeSessionId, // Ensure ID remains the same
              name: sessionToSave.name, // Preserve original name unless formState includes it
              projectDirectory: formState.projectDirectory, // Ensure these are correct
              outputFormat: formState.outputFormat,       // Ensure these are correct
              updatedAt: Date.now() // Update timestamp
            };

            // Log the data being sent to saveSession
            console.log('[FormStateManager] Data prepared for repository.saveSession:', updatedSessionData);

            await repository.saveSession(updatedSessionData);
              // When a new session becomes active, fetch its *initial* state to set the baseline for comparison
              // This prevents the very first change after load from being missed.
              const initializeRef = async () => {
                  const sessionData = await repository.getSession(activeSessionId);
                  if (sessionData) {
                      // Exclude metadata fields when setting the initial reference
                      const { id, name, updatedAt, ...initialState } = sessionData;
                      lastSavedStateRef.current = initialState;
                      console.log(`[FormStateManager] Initialized lastSavedStateRef for newly active session ${activeSessionId}`);
                  } else {
                      // If session not found (edge case), initialize with current form state as fallback
                      lastSavedStateRef.current = { ...formState };
                      console.warn(`[FormStateManager] Session ${activeSessionId} not found during initialization. Using current form state as baseline.`);
                  }
              };
              initializeRef();
            console.log(`[FormStateManager] Auto-save successful for session ${activeSessionId}`);
          } else {
            console.warn(`[FormStateManager] Session ${activeSessionId} not found during auto-save attempt.`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error during auto-save";
          console.error("[FormStateManager] Auto-save failed:", error);
          setSaveError(errorMsg);
          if (onSaveError) onSaveError(errorMsg); // Notify parent
        } finally {
          isSavingRef.current = false; // Ensure saving flag is reset
        }
      }, 1500); // Debounce auto-save (e.g., 1.5 seconds)
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [activeSessionId, formStateString, repository, onStateChange, onSaveError, formState]); // Depend on stringified state & callbacks

  return <>{children}</>;
};

export default FormStateManager;

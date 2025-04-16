"use client";

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Session } from '@/types';
import { useDatabase } from '@/lib/contexts/database-context';
import { useDebounceCallback } from 'usehooks-ts'; // Import debounce hook

export interface FormStateManagerProps {
  activeSessionId: string | null;
  sessionName?: string; // Make sessionName optional
  projectDirectory: string;
  isSaving: boolean;
  formState: Omit<Session, 'id' | 'name' | 'updatedAt'>; // The current state of the form (excluding generated/metadata fields)
  onStateChange?: (hasChanges: boolean) => void; // Notify parent about change status
  onSaveError?: (error: string | null) => void; // Callback for save errors
  children: React.ReactNode;
}

const FormStateManager: React.FC<FormStateManagerProps> = ({ 
  sessionName = "", // Provide default value
  activeSessionId,
  projectDirectory,
  formState,
  isSaving, // Receive isSaving state from parent
  onStateChange,
  onSaveError,
  children,
}) => {
  const { repository, isInitialized } = useDatabase(); // Get repository and initialization status
  const lastSavedStateRef = useRef<Omit<Session, 'id' | 'name' | 'updatedAt'> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false); // Internal saving flag to prevent race conditions
  const isFirstLoadRef = useRef(true); // Track initial load

  // Memoize the form state string representation for dependency array
  const formStateString = useMemo(() => JSON.stringify(formState), [formState]);

  useEffect(() => {
    if (activeSessionId) {
      setSaveError(null); // Clear error when session changes
      lastSavedStateRef.current = null; // Reset last saved state on session change
      isFirstLoadRef.current = true; // Reset first load flag on session change
      console.log(`[FormStateManager] Session changed to ${activeSessionId}. Resetting state.`);
    }
  }, [activeSessionId]);


  const debouncedSave = useDebounceCallback(async (sessionId: string | null, currentState: typeof formState, currentSessionName: string) => {
    if (!sessionId) return; // Should not happen if activeSessionId is required
    if (isSavingRef.current) return; // Prevent concurrent saves

    isSavingRef.current = true;
    try {
      const sessionToSave = await repository.getSession(sessionId!); // Use non-null assertion as checked before
      if (sessionToSave) {
        // Exclude Gemini fields from the current state to avoid overwriting live status
        const { geminiStatus, geminiStartTime, geminiEndTime, geminiPatchPath, geminiStatusMessage, geminiTokensReceived, geminiCharsReceived, geminiLastUpdate, ...formStateWithoutGemini } = currentState;
        
        // Remove outputFormat and customFormat from updatedSessionData
        const updatedSessionData: Session = {
          ...sessionToSave, // Start with existing session data from DB
          ...formStateWithoutGemini, // Overwrite with current form state (excluding gemini status fields)
          id: activeSessionId, // Ensure ID remains the same
          name: sessionName, // Use current session name from props
          projectDirectory: formState.projectDirectory, // Ensure these are correct
          updatedAt: Date.now() // Update timestamp
        };
        
        // Preserve the existing Gemini fields from the database
        updatedSessionData.geminiStatus = sessionToSave.geminiStatus;
        updatedSessionData.geminiStartTime = sessionToSave.geminiStartTime;
        updatedSessionData.geminiEndTime = sessionToSave.geminiEndTime; // Ensure correct field name
        updatedSessionData.geminiPatchPath = sessionToSave.geminiPatchPath;
        updatedSessionData.geminiTokensReceived = sessionToSave.geminiTokensReceived ?? 0; // Default to 0 if null
        updatedSessionData.geminiCharsReceived = sessionToSave.geminiCharsReceived ?? 0; // Default to 0 if null
        updatedSessionData.geminiStatusMessage = sessionToSave.geminiStatusMessage;
        updatedSessionData.geminiLastUpdate = sessionToSave.geminiLastUpdate;

        // Prevent concurrent saves
        if (isSavingRef.current) return;
        
        await repository.saveSession(updatedSessionData);
        // Update lastSavedStateRef *after* successful save
        lastSavedStateRef.current = { ...formState };
        if (onStateChange) onStateChange(false); // Reset change status after save
        console.log(`[FormStateManager] Auto-save successful for session ${activeSessionId}. State updated.`);
        setSaveError(null); // Clear error on success
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
  }, 1000); // Debounce for 1 second

  // Effect to trigger debounced save on state change
  useEffect(() => {
    // Don't save on initial load, while saving, or if dependencies aren't ready
    if (isFirstLoadRef.current || isSavingRef.current || !activeSessionId || !repository || !isInitialized) {
      // On the very first load for a session, set the last saved state to the current state
      if (isFirstLoadRef.current && activeSessionId) {
        lastSavedStateRef.current = { ...formState };
        isFirstLoadRef.current = false;
        console.log(`[FormStateManager] Initial state set for session ${activeSessionId}.`);
      }
      return;
    }

    // Compare current state with the last known saved state for this session
    const hasChanges = lastSavedStateRef.current === null || JSON.stringify(formState) !== JSON.stringify(lastSavedStateRef.current);
    if (onStateChange) onStateChange(hasChanges);

    if (hasChanges) {
      console.log(`[FormStateManager] Changes detected for session ${activeSessionId}. Scheduling auto-save.`);
      // Debounced save logic
      debouncedSave(activeSessionId, formState, sessionName);
    }
  }, [activeSessionId, formStateString, repository, isInitialized, onStateChange, onSaveError, formState, sessionName, debouncedSave]);

  return <>{children}</>; // Render children regardless of state
};

export default FormStateManager;

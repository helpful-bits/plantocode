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
    // Clear error when dependencies change but session is still active
    if (activeSessionId && repository && isInitialized) {
      setSaveError(null);
    }
  }, [activeSessionId]);


  const debouncedSave = useCallback(async (sessionId: string, currentState: any, sessionName: string) => {
    console.log(`[FormStateManager] Running debounced save for session ${sessionId}`);
    if (isSavingRef.current) {
      console.log(`[FormStateManager] Skipping save - already in progress for session ${sessionId}`);
      return;
    }
    isSavingRef.current = true;
    try {
      const sessionToSave = await repository.getSession(sessionId!); // Use non-null assertion as checked before
      if (sessionToSave) {
        // Extract Gemini fields from the *current* form state to exclude them from the merge, preserving DB values
        const { geminiStatus, geminiStartTime, geminiEndTime, geminiPatchPath, geminiStatusMessage, geminiTokensReceived, geminiCharsReceived, geminiLastUpdate, ...formStateWithoutGemini } = currentState;

        // Specifically extract forceExcludedFiles from the current state to ensure it's saved
        const { forceExcludedFiles } = currentState;

        // Ensure session name is not empty
        const effectiveSessionName = sessionName && sessionName.trim()
          ? sessionName.trim()
          : sessionToSave.name && sessionToSave.name.trim()
            ? sessionToSave.name.trim()
            : `Session ${new Date().toLocaleString()}`;
        
        // Remove outputFormat and customFormat from updatedSessionData
        const updatedSessionData: Session = {
          ...sessionToSave, // Start with existing session data from DB
          ...formStateWithoutGemini, // Overwrite with current form state (excluding Gemini status fields)
          forceExcludedFiles: forceExcludedFiles || [], // Explicitly include forceExcludedFiles from current state
          id: activeSessionId, // Ensure ID remains the same
          name: effectiveSessionName, // Use non-empty session name
          projectDirectory: formState.projectDirectory, // Ensure these are correct
          updatedAt: Date.now(), // Update timestamp
        };
        
        // Re-apply the existing Gemini fields from the database (already done by spreading sessionToSave first)
        updatedSessionData.geminiStatus = sessionToSave.geminiStatus;
        updatedSessionData.geminiStartTime = sessionToSave.geminiStartTime;
        updatedSessionData.geminiEndTime = sessionToSave.geminiEndTime; // Ensure correct field name
        updatedSessionData.geminiPatchPath = sessionToSave.geminiPatchPath;
        updatedSessionData.geminiTokensReceived = sessionToSave.geminiTokensReceived ?? 0; // Default to 0 if null
        updatedSessionData.geminiCharsReceived = sessionToSave.geminiCharsReceived ?? 0; // Default to 0 if null
        updatedSessionData.geminiStatusMessage = sessionToSave.geminiStatusMessage;
        updatedSessionData.geminiLastUpdate = sessionToSave.geminiLastUpdate;

        // Prevent concurrent saves
        // Re-check isSavingRef just before the DB call, although it should be true here
        if (!isSavingRef.current) {
           console.warn(`[FormStateManager] isSavingRef became false unexpectedly before DB call for session ${sessionId}`);
           isSavingRef.current = true; // Ensure it's true
        }

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
  }, [activeSessionId, repository, isInitialized, onStateChange, onSaveError, formState, sessionName]);

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
    console.log(`[FormStateManager] useEffect triggered for session ${activeSessionId}. Form state length: ${formStateString.length}`);
    // Compare current state with the last known saved state for this session
    const hasChanges = lastSavedStateRef.current === null || JSON.stringify(formState) !== JSON.stringify(lastSavedStateRef.current);
    if (onStateChange) onStateChange(hasChanges);

    if (hasChanges) {
      // Additional check: Don't save if essential fields are missing in the current state being saved
      if (!formState.projectDirectory?.trim()) {
        console.warn(`[FormStateManager] Auto-save skipped for session ${activeSessionId} - projectDirectory is empty in current formState.`);
        setSaveError("Cannot auto-save: Project directory is missing.");
        if (onSaveError) onSaveError("Cannot auto-save: Project directory is missing.");
        return;
      }
      console.log(`[FormStateManager] Changes detected for session ${activeSessionId}. Scheduling auto-save.`);
      // Debounced save logic
      debouncedSave(activeSessionId, formState, sessionName);
    }
  }, [activeSessionId, formStateString, repository, isInitialized, onStateChange, onSaveError, formState, sessionName, debouncedSave]);

  return <>{children}</>; // Render children regardless of state
};

export default FormStateManager;

"use client";

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Session } from '@/types'; // Keep Session import
import { useDatabase } from '@/lib/contexts/database-context';
import { useDebounceCallback } from 'usehooks-ts';

export interface FormStateManagerProps {
  activeSessionId: string | null;
  sessionLoaded: boolean; // Add prop to know if session finished loading
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
  sessionLoaded,
  activeSessionId,
  projectDirectory,
  formState,
  isSaving, // Receive isSaving state from parent
  onStateChange,
  onSaveError,
  children,
}) => {
  const { repository, isInitialized } = useDatabase(); // Get repository and initialization status
  const lastSavedStateRef = useRef<Omit<Session, 'id' | 'name' | 'updatedAt' | 'updatedAt'> | null>(null); // Adjust type
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false); // Internal saving flag to prevent race conditions
  const initialLoadDoneRef = useRef<Record<string, boolean>>({}); // Track initial load per session
  const isFirstLoadRef = useRef<boolean>(true); // Add ref for tracking first load

  // Memoize the form state string representation for dependency array
  const formStateString = useMemo(() => JSON.stringify(formState), [formState]);

  // Reset state when session changes
  useEffect(() => {
    if (activeSessionId) {
      setSaveError(null); // Clear error when session changes
      lastSavedStateRef.current = null; // Reset last saved state on session change
      isFirstLoadRef.current = true; // Reset first load flag on session change
      console.log(`[FormStateManager] Session changed to ${activeSessionId}. Resetting state.`);
    } else {
      // No active session, clear error and state
      setSaveError(null);
      lastSavedStateRef.current = null;
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
      console.log(`[FormStateManager] Fetching current state of session ${sessionId} from DB before save...`);
      const sessionToSave = await repository.getSession(sessionId);
      if (sessionToSave) {
        console.log(`[FormStateManager] Current DB state for ${sessionId}:`, sessionToSave);
        const { geminiRequests, ...formFields } = currentState; // Exclude geminiRequests from direct save

        // Ensure session name is not empty
        // Use the provided sessionName prop if available, otherwise fallback to DB or generate
        const effectiveSessionName = sessionName && sessionName.trim()
          ? sessionName.trim()
          : sessionToSave.name && sessionToSave.name.trim()
            ? sessionToSave.name.trim() // Fallback to current DB name
            : `Session ${new Date().toLocaleString()}`;

        // Create the update payload - start with existing DB data, merge *only* form fields
        // Crucially, DO NOT merge Gemini status fields from formState, they are managed by background processes
        const updatePayload: Session = {
          ...sessionToSave,          // Start with existing session data from DB
          ...formFields,             // Apply the current form fields (task desc, files, etc.)
          id: sessionId!,             // Ensure ID remains the same
          name: effectiveSessionName, // Use the determined session name
          projectDirectory: formState.projectDirectory, // Ensure these are correct
          updatedAt: Date.now(), // Update timestamp
        };

        // NOTE: Gemini fields (status, start/end time, patch path, message, stats)
        // are NOT merged here. They are updated separately by the Gemini actions
        // to avoid overwriting background process state. We explicitly take Gemini fields
        // ONLY from sessionToSave (the current DB state).
        updatePayload.geminiStatus = sessionToSave.geminiStatus;
        updatePayload.geminiStartTime = sessionToSave.geminiStartTime;
        updatePayload.geminiEndTime = sessionToSave.geminiEndTime;
        updatePayload.geminiXmlPath = sessionToSave.geminiXmlPath;
        updatePayload.geminiStatusMessage = sessionToSave.geminiStatusMessage;
        updatePayload.geminiTokensReceived = sessionToSave.geminiTokensReceived;
        updatePayload.geminiCharsReceived = sessionToSave.geminiCharsReceived;
        updatePayload.geminiLastUpdate = sessionToSave.geminiLastUpdate;
        updatePayload.geminiRequests = sessionToSave.geminiRequests; // Preserve requests
        // Prevent concurrent saves
        // Re-check isSavingRef just before the DB call, although it should be true here
        if (!isSavingRef.current) {
           console.warn(`[FormStateManager] isSavingRef became false unexpectedly before DB call for session ${sessionId}`);
           isSavingRef.current = true; // Ensure it's true
        }

        console.log(`[FormStateManager] Saving updated payload for session ${sessionId}...`, updatePayload);
        await repository.saveSession(updatePayload);
        // Update lastSavedStateRef *after* successful save
        // Save only the formState part, not the full payload
        lastSavedStateRef.current = { ...currentState }; // Use currentState which excludes geminiRequests
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

  // Debounce the save function
  const debouncedSaveFn = useDebounceCallback(debouncedSave, 500); // Reduced from 1500ms to 500ms for faster saves during HMR

  // Effect to trigger debounced save on state change
  useEffect(() => {
    // Conditions to prevent saving:
    // - No active session ID
    // - Dependencies not ready (DB)
    // - Session data hasn't finished loading yet (new sessionLoaded prop)
    // - Already saving
    if (!activeSessionId || !repository || !isInitialized || !sessionLoaded || isSavingRef.current) {
      return;
    }

    // Check if this is the initial load for this specific session ID
    if (!initialLoadDoneRef.current[activeSessionId]) {
      // On the first load *after* sessionLoaded becomes true, set the initial saved state
      if (sessionLoaded) {
        lastSavedStateRef.current = { ...formState };
        initialLoadDoneRef.current[activeSessionId] = true;
        console.log(`[FormStateManager] Initial state captured for session ${activeSessionId}.`);
      }
      return;
    }

    // Compare current form state with the last known saved state for this session
    const hasChanges = lastSavedStateRef.current === null || JSON.stringify(formState) !== JSON.stringify(lastSavedStateRef.current);
    if (onStateChange) onStateChange(hasChanges);

    if (hasChanges) {
      if (!formState.projectDirectory?.trim()) {
        console.warn(`[FormStateManager] Auto-save skipped for session ${activeSessionId} - projectDirectory is empty in current formState.`);
        setSaveError("Cannot auto-save: Project directory is missing.");
        if (onSaveError) onSaveError("Cannot auto-save: Project directory is missing.");
        return;
      }
      console.log(`[FormStateManager] Changes detected for session ${activeSessionId}. Scheduling auto-save.`);
      // Use the debounced function
      debouncedSaveFn(activeSessionId, formState, sessionName);
    }
    // Added sessionLoaded and debouncedSaveFn to dependencies
  }, [activeSessionId, sessionLoaded, formStateString, repository, isInitialized, onStateChange, onSaveError, formState, sessionName, debouncedSaveFn]);

  return <>{children}</>; // Render children regardless of state
};
export default FormStateManager;

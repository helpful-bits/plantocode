"use client";

import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Session } from '@/types';
import { useDatabase } from '@/lib/contexts/database-context';
import { useDebounceCallback } from 'usehooks-ts'; // Import debounce hook

export interface FormStateManagerProps {
  activeSessionId: string | null; // Keep props as defined
  sessionName: string; 
  projectDirectory: string;
  outputFormat: string;
  formState: Omit<Session, 'id' | 'name' | 'updatedAt'>; // The current state of the form (excluding generated/metadata fields)
  onStateChange?: (hasChanges: boolean) => void; // Notify parent about change status
  onSaveError?: (error: string | null) => void; // Callback for save errors
  children: React.ReactNode;
}

const FormStateManager: React.FC<FormStateManagerProps> = ({ 
  sessionName, // Use sessionName from props
  activeSessionId,
  projectDirectory,
  outputFormat,
  formState,
  onStateChange,
  onSaveError,
  children,
}) => {
  const { repository } = useDatabase();
  const lastSavedStateRef = useRef<Omit<Session, 'id' | 'name' | 'updatedAt'> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false);

  // Memoize the form state string representation for dependency array
  const formStateString = useMemo(() => JSON.stringify(formState), [formState]);

  useEffect(() => {
    if (activeSessionId) {
      setSaveError(null); // Clear error when session changes
    }
  }, [activeSessionId, repository]);

  // Debounced auto-save effect - uses formStateString and formState as dependencies
  useEffect(() => {
    if (!activeSessionId || !lastSavedStateRef.current || isSavingRef.current || !repository) return; // Add repository check

    // Compare current state with the last known state for this session
    const hasChanges = JSON.stringify(formState) !== JSON.stringify(lastSavedStateRef.current); 
    if (onStateChange) onStateChange(hasChanges);

    if (hasChanges) {
      // Debounced save logic
      debouncedSave(activeSessionId, formState, sessionName);
    }
  }, [activeSessionId, formStateString, repository, onStateChange, onSaveError, formState, sessionName]);

  const debouncedSave = useDebounceCallback(async (sessionId: string | null, currentState: typeof formState, currentSessionName: string) => {
        isSavingRef.current = true; // Set saving flag
      try {
          const sessionToSave = await repository.getSession(sessionId!); // Use non-null assertion as checked before
          if (sessionToSave) {
              const { geminiStatus, geminiStartTime, geminiEndTime, geminiPatchPath, geminiStatusMessage, ...formStateWithoutGemini } = currentState;

            const updatedSessionData: Session = {
              ...sessionToSave, // Start with existing session data
              ...formStateWithoutGemini, // Overwrite with current form state (excluding gemini status fields)
              id: activeSessionId, // Ensure ID remains the same
              name: sessionName, // Use current session name from props
              projectDirectory: formState.projectDirectory, // Ensure these are correct
              outputFormat: formState.outputFormat,       // Ensure these are correct
              updatedAt: Date.now() // Update timestamp
            };
            
            // Add back the Gemini fields from the fetched sessionToSave to preserve them
            updatedSessionData.geminiStatus = sessionToSave.geminiStatus;
            updatedSessionData.geminiStartTime = sessionToSave.geminiStartTime;
            updatedSessionData.geminiEndTime = sessionToSave.geminiEndTime; // Ensure correct field name
            updatedSessionData.geminiPatchPath = sessionToSave.geminiPatchPath;
            updatedSessionData.geminiStatusMessage = sessionToSave.geminiStatusMessage;

            await repository.saveSession(updatedSessionData);
            // Update lastSavedStateRef *after* successful save
            lastSavedStateRef.current = { ...formState };
            console.log(`[FormStateManager] Auto-save successful for session ${activeSessionId}`);
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


    return <>{children}</>;
};

export default FormStateManager;

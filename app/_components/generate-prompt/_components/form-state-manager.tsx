"use client";

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { Session } from '@/types';
import { useDatabase } from '@/lib/contexts/database-context';

interface FormStateManagerProps {
  activeSessionId: string | null;
  projectDirectory: string;
  outputFormat: string;
  formState: Omit<Session, 'id' | 'name'>; // The current state of the form
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
  const lastSavedStateRef = useRef<Omit<Session, 'id' | 'name'> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false); // Prevent concurrent saves

  // Memoize the form state string representation for dependency array
  const formStateString = useMemo(() => JSON.stringify(formState), [formState]);

  // Update last saved state when session changes or is loaded
  useEffect(() => {
    if (activeSessionId) {
      lastSavedStateRef.current = { ...formState }; // Initialize on session load
      setSaveError(null); // Clear error when session changes
    } else {
      lastSavedStateRef.current = null; // Clear when no session active
    }
  }, [activeSessionId, formState]); // Depend on formState to re-initialize when session loads

  // Debounced auto-save effect
  useEffect(() => {
    if (!activeSessionId || !lastSavedStateRef.current || isSavingRef.current) return;

    // Compare current state with the last known state for this session
    const hasChanges = JSON.stringify(formState) !== JSON.stringify(lastSavedStateRef.current);
    if (onStateChange) onStateChange(hasChanges);

    if (hasChanges) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(async () => {
        if (!activeSessionId || isSavingRef.current) return; // Double-check
        isSavingRef.current = true;
        console.log(`[FormStateManager] Auto-saving changes for session ${activeSessionId}...`);
        try {
          const sessionToSave = await repository.getSession(activeSessionId);
          if (sessionToSave) {
            await repository.saveSession({ ...sessionToSave, ...formState, updatedAt: Date.now() });
            lastSavedStateRef.current = { ...formState }; // Update last saved state after successful save
            setSaveError(null); // Clear error on success
            if (onSaveError) onSaveError(null); // Notify parent
            console.log(`[FormStateManager] Auto-save successful for session ${activeSessionId}`);
          } else {
            console.warn(`[FormStateManager] Session ${activeSessionId} not found during auto-save attempt.`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to auto-save session";
          console.error("[FormStateManager] Auto-save failed:", error);
          setSaveError(errorMsg);
          if (onSaveError) onSaveError(errorMsg); // Notify parent
        }
        isSavingRef.current = false; // Ensure saving flag is reset
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

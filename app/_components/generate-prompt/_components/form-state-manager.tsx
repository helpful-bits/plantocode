"use client";

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { Session } from '@/types'; // Keep Session import
import { useDatabase } from '@/lib/contexts/database-context';
import { useDebounceCallback } from 'usehooks-ts';
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { createSessionMonitor } from '@/lib/utils/session-debug';

export interface FormStateManagerProps {
  activeSessionId: string | null;
  sessionLoaded: boolean; // Add prop to know if session finished loading
  sessionName?: string; // Make sessionName optional
  projectDirectory: string;
  isSaving: boolean;
  formState: Omit<Session, 'id' | 'name' | 'updatedAt'>; // The current state of the form (excluding generated/metadata fields)
  onStateChange?: (hasChanges: boolean) => void; // Notify parent about change status
  onSaveError?: (error: string | null) => void; // Callback for save errors
  onIsSavingChange?: (isSaving: boolean) => void; // NEW: Callback to notify parent about saving state changes
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
  onIsSavingChange,
  children,
}) => {
  const { repository, isInitialized } = useDatabase(); // Get repository and initialization status
  const lastSavedStateRef = useRef<Omit<Session, 'id' | 'name' | 'updatedAt'> | null>(null); // Adjust type
  const [saveError, setSaveError] = useState<string | null>(null);
  const isSavingRef = useRef(false); // Internal saving flag to prevent race conditions
  const initialLoadDoneRef = useRef<Record<string, boolean>>({}); // Track initial load per session
  const isFirstLoadRef = useRef<boolean>(true); // Add ref for tracking first load
  const saveVersionRef = useRef<number>(0); // Track save versions to detect outdated saves

  // Track session initialization time to prevent premature saves
  const sessionInitTimeRef = useRef<Record<string, number>>({});
  
  // Session monitor for debugging
  const sessionMonitorRef = useRef(createSessionMonitor());
  
  // Add prevSessionId ref at the component level
  const prevSessionId = useRef<string | null>(null);

  // Memoize the form state string representation for dependency array
  const formStateString = useMemo(() => JSON.stringify(formState), [formState]);

  // Define debouncedSave function first
  const debouncedSave = useCallback(async (sessionId: string, currentState: any, sessionName: string, saveVersion: number) => {
    console.log(`[FormStateManager] Running debounced save for session ${sessionId} (version ${saveVersion})`);
    
    // Skip if this save version is outdated
    if (saveVersion < saveVersionRef.current) {
      console.log(`[FormStateManager] Skipping outdated save version ${saveVersion} < ${saveVersionRef.current}`);
      return;
    }
    
    // Check if session is busy with an incompatible operation
    if (sessionSyncService.isSessionBusy(sessionId) && sessionSyncService.getSessionState(sessionId) !== 'saving') {
      console.log(`[FormStateManager] Session ${sessionId} is busy with operation ${sessionSyncService.getSessionState(sessionId)}, deferring save`);
      // Queue another save attempt
      setTimeout(() => {
        if (saveVersion >= saveVersionRef.current) {
          debouncedSave(sessionId, currentState, sessionName, saveVersion);
        }
      }, 500);
      return;
    }
    
    if (isSavingRef.current) {
      console.log(`[FormStateManager] Skipping save - already in progress for session ${sessionId}`);
      return;
    }
    
    // Set saving state and notify parent
    isSavingRef.current = true;
    if (onIsSavingChange) {
      onIsSavingChange(true);
    }
    
    try {
      // Use the synchronization service to coordinate saving
      await sessionSyncService.queueOperation(
        'save',
        sessionId,
        async () => {
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

            // Fallback to prop projectDirectory if missing from form state during HMR
            const effectiveProjectDirectory = formFields.projectDirectory?.trim() 
              ? formFields.projectDirectory 
              : projectDirectory;

            // Create the update payload - start with existing DB data, merge *only* form fields
            const updatePayload: Session = {
              ...sessionToSave,          // Start with existing session data from DB
              ...formFields,             // Apply the current form fields (task desc, files, etc.)
              id: sessionId!,            // Ensure ID remains the same
              name: effectiveSessionName, // Use the determined session name
              projectDirectory: effectiveProjectDirectory, // Use fallback if needed
              updatedAt: Date.now(), // Update timestamp
            };

            // Keep geminiRequests from the session in DB (they're managed separately)
            updatePayload.geminiRequests = sessionToSave.geminiRequests;
            
            // Keep modelUsed from the form state if provided, otherwise preserve the existing one
            updatePayload.modelUsed = formFields.modelUsed || sessionToSave.modelUsed;

            console.log(`[FormStateManager] Saving updated payload for session ${sessionId}...`);
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
        },
        1 // Lower priority for auto-saves
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error during auto-save";
      console.error("[FormStateManager] Auto-save failed:", error);
      setSaveError(errorMsg);
      if (onSaveError) onSaveError(errorMsg); // Notify parent
    } finally {
      // Reset saving flag and notify parent
      isSavingRef.current = false;
      if (onIsSavingChange) {
        onIsSavingChange(false);
      }
    }
  }, [activeSessionId, repository, isInitialized, onStateChange, onSaveError, onIsSavingChange, projectDirectory]);

  // Debounce the save function
  const debouncedSaveFn = useDebounceCallback(
    (sessionId: string, formState: any, sessionName: string) => {
      const saveVersion = ++saveVersionRef.current;
      debouncedSave(sessionId, formState, sessionName, saveVersion);
    }, 
    1000 // Increased from 500ms to 1000ms for better debounce behavior
  );

  // Reset state when session changes
  useEffect(() => {
    // Record session for monitoring
    sessionMonitorRef.current.recordSession(activeSessionId);
    
    if (activeSessionId !== prevSessionId.current) {
      console.log(`[FormStateManager] Session ID changed from ${prevSessionId.current} to ${activeSessionId}`);
      
      // Cancel any pending debounced saves if debouncedSaveFn is available
      if (debouncedSaveFn && typeof debouncedSaveFn.cancel === 'function') {
        console.log('[FormStateManager] Cancelling pending saves due to session change');
        debouncedSaveFn.cancel();
      }
      
      // If we're switching to a new session (not just initializing)
      if (prevSessionId.current !== null && activeSessionId !== null) {
        console.log(`[FormStateManager] Detected session switch from ${prevSessionId.current} to ${activeSessionId}`);
        
        // Increase cooldown periods to better handle transitions
        // Add a cooldown to previous session to prevent racing conditions
        if (prevSessionId.current) {
          sessionSyncService.setCooldown(prevSessionId.current, 'save', 3000);
          console.log(`[FormStateManager] Set 3000ms cooldown on previous session ${prevSessionId.current}`);
        }
        
        // Wait longer before allowing saves on the new session
        if (activeSessionId) {
          sessionSyncService.setCooldown(activeSessionId, 'save', 2000);
          console.log(`[FormStateManager] Set 2000ms cooldown on new session ${activeSessionId}`);
        }
      }
      
      // Record the time this session was initialized
      if (activeSessionId) {
        sessionInitTimeRef.current[activeSessionId] = Date.now();
        console.log(`[FormStateManager] Recorded init time for session ${activeSessionId}: ${new Date().toISOString()}`);
      }
      
      // Reset local state
      setSaveError(null); // Clear error when session changes
      lastSavedStateRef.current = null; // Reset last saved state on session change
      isFirstLoadRef.current = true; // Reset first load flag on session change
      console.log(`[FormStateManager] Session changed to ${activeSessionId || 'null'}. Resetting state.`);
      
      // Update tracked previous session ID
      prevSessionId.current = activeSessionId;
    } else {
      // No active session, clear error and state
      if (!activeSessionId) {
        setSaveError(null);
        lastSavedStateRef.current = null;
      }
    }
    
    // Start the session monitor if this is first load
    if (isFirstLoadRef.current) {
      sessionMonitorRef.current.startMonitoring();
      isFirstLoadRef.current = false;
    }
    
    // Cleanup function
    return () => {
      // If component unmounts, consider stopping the monitor
      if (typeof window !== 'undefined') {
        // But persist it in the window object so we can still check it
        if (!(window as any).__sessionMonitorState) {
          (window as any).__sessionMonitorState = sessionMonitorRef.current;
        }
      }
    };
  }, [activeSessionId, debouncedSaveFn]);

  // Effect to trigger debounced save on state change
  useEffect(() => {
    // Conditions to prevent saving:
    // - No active session ID
    // - Dependencies not ready (DB)
    // - Session data hasn't finished loading yet (new sessionLoaded prop)
    // - Already saving
    // - Session is busy with incompatible operation
    if (!activeSessionId || 
        !repository || 
        !isInitialized || 
        !sessionLoaded || 
        isSavingRef.current) {
      return;
    }
    
    // Check if session is in an incompatible state
    const sessionState = sessionSyncService.getSessionState(activeSessionId);
    if (sessionState === 'loading') {
      console.log(`[FormStateManager] Not saving - session ${activeSessionId} is in loading state`);
      return;
    }

    // Additional check for time-based cooldown after session initialization
    // Wait at least 2.5 seconds after session initialization before allowing saves
    const initTime = sessionInitTimeRef.current[activeSessionId] || 0;
    const timeSinceInit = Date.now() - initTime;
    if (timeSinceInit < 2500) {
      console.log(`[FormStateManager] Not saving session ${activeSessionId} - too soon after initialization (${timeSinceInit}ms)`);
      return;
    }

    // Check if there's a session-specific cooldown active
    if (sessionState !== 'idle' && sessionState !== 'saving') {
      console.log(`[FormStateManager] Not saving - session ${activeSessionId} is in ${sessionState} state`);
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
      if (!formState.projectDirectory?.trim() && !projectDirectory?.trim()) {
        console.warn(`[FormStateManager] Auto-save skipped for session ${activeSessionId} - projectDirectory is missing in current formState.`);
        setSaveError("Cannot auto-save: Project directory is missing.");
        if (onSaveError) onSaveError("Cannot auto-save: Project directory is missing.");
        return;
      }
      console.log(`[FormStateManager] Changes detected for session ${activeSessionId}. Scheduling auto-save.`);
      // Use the debounced function
      debouncedSaveFn(activeSessionId, formState, sessionName);
    }
  }, [activeSessionId, sessionLoaded, formStateString, repository, isInitialized, onStateChange, onSaveError, formState, sessionName, debouncedSaveFn, projectDirectory]);

  return (
    <>{children}</>
  );
};

export default React.memo(FormStateManager);

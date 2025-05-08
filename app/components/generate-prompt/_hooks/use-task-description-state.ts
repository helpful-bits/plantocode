"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useBackgroundJob } from "@/lib/contexts/background-jobs-context";
import { improveSelectedTextAction } from "@/actions/text-improvement-actions";
import { useNotification } from '@/lib/contexts/notification-context';
import { useProject } from "@/lib/contexts/project-context";
import { AUTO_SAVE_INTERVAL } from "@/lib/constants";
import debounce from '@/lib/utils/debounce';
import { sessionSyncService } from '@/lib/services/session-sync-service';
import { useAsyncAction } from "./use-async-state";

interface UseTaskDescriptionStateProps {
  activeSessionId: string | null;
  onInteraction?: () => void;
  taskDescriptionRef: React.RefObject<HTMLTextAreaElement>;
}

export function useTaskDescriptionState({
  activeSessionId,
  onInteraction,
  taskDescriptionRef
}: UseTaskDescriptionStateProps) {
  // Get the necessary states from the project context
  const { isSwitchingSession, activeSessionId: globalActiveSessionId, projectDirectory } = useProject();
  
  // Core state
  const [taskDescription, setTaskDescription] = useState("");
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [textImprovementJobId, setTextImprovementJobId] = useState<string | null>(null);
  
  // Refs
  const lastContentRef = useRef<string>('');
  const loadedSessionIdRef = useRef<string | null>(null); // Track which session's data is currently loaded
  const taskDescriptionForOutgoingSaveRef = useRef<string>("");
  
  // Keep a copy of taskDescription for saving when switching sessions
  useEffect(() => {
    taskDescriptionForOutgoingSaveRef.current = taskDescription;
  }, [taskDescription]);
  
  // External hooks
  const { showNotification } = useNotification();
  // Fetch the background job
  const textImprovementJob = useBackgroundJob(textImprovementJobId);
  
  // Generate localStorage key for taskDescription backup - use activeSessionId
  const localStorageKey = useMemo(() => {
    if (!activeSessionId) {
      // Define a key for when no session is active
      return `task-description-backup-no-active-session`;
    }
    return `task-description-backup-${activeSessionId}`;
  }, [activeSessionId]);

  // Initialize from local storage on mount
  useEffect(() => {
    // localStorageKey is now reactive to activeSessionId due to its own useMemo dependency.
    const currentKey = localStorageKey; // Capture the key for this render

    if (!activeSessionId && currentKey !== `task-description-backup-no-active-session`) {
      // If activeSessionId is null, but the key isn't the "no-active-session" key,
      // it might be a state inconsistency during transition. Avoid restoring.
      console.log('[TaskDescriptionState] No active session, restore behavior depends on localStorageKey for "no-active-session". Current key:', currentKey);
    }

    try {
      // Only restore if current taskDescription state is empty.
      // This allows explicitly loaded DB data (via loadDataForSession) to take precedence.
      if ((!taskDescription || taskDescription.trim() === '') && activeSessionId) { // Ensure activeSessionId to use its key
        const backup = localStorage.getItem(currentKey);
        if (backup !== null) {
          console.log(`[TaskDescriptionState] Restoring TD for session ${activeSessionId} from key ${currentKey}:`,
            backup.length > 0 ? `(first ${backup.substring(0, 20)}... of ${backup.length} chars)` : '(empty string)');
          setTaskDescription(backup);
          // loadedSessionIdRef.current should already be set to activeSessionId by the session change effect
          if (onInteraction) onInteraction();
        } else {
          console.log(`[TaskDescriptionState] No local storage backup found for session ${activeSessionId} using key ${currentKey}`);
        }
      } else if ((!taskDescription || taskDescription.trim() === '') && !activeSessionId && currentKey === `task-description-backup-no-active-session`) {
        // Handle restoring for "no-active-session" if applicable
        const backup = localStorage.getItem(currentKey);
        if (backup !== null) {
          console.log(`[TaskDescriptionState] Restoring TD for "no-active-session" from key ${currentKey}`);
          setTaskDescription(backup);
          if (onInteraction) onInteraction();
        }
      } else {
        console.log('[TaskDescriptionState] Not restoring from local storage - value already exists:', 
          `(first ${taskDescription.substring(0, 20)}... of ${taskDescription.length} chars)`);
      }
    } catch (error) {
      console.error('[TaskDescriptionState] Error accessing localStorage for restore:', error);
    }
  }, [localStorageKey, taskDescription, activeSessionId, setTaskDescription, onInteraction]);

  // Update local storage when value changes
  useEffect(() => {
    // Skip saving to localStorage during session switching
    if (isSwitchingSession) {
      console.log(`[TaskDescriptionState] Suppressed localStorage save: session switch in progress`);
      return;
    }
    
    const currentKey = localStorageKey; // Capture the key for this render
    try {
      if (typeof taskDescription === 'string') { // Ensure taskDescription is a string
        // Use the global active session ID from context for consistent session identification
        const currentActiveSessionId = globalActiveSessionId || activeSessionId;
        
        // Log based on whether there's an active session or not
        if (currentActiveSessionId) {
          console.log(`[TaskDescriptionState] Saving TD for session ${currentActiveSessionId} to key ${currentKey} (${taskDescription.length} chars)`);
        } else {
          console.log(`[TaskDescriptionState] Saving TD for "no-active-session" to key ${currentKey} (${taskDescription.length} chars)`);
        }
        localStorage.setItem(currentKey, taskDescription);
      }
    } catch (error) {
      console.error('[TaskDescriptionState] Error saving to localStorage:', error);
    }
  }, [taskDescription, localStorageKey, activeSessionId, globalActiveSessionId, isSwitchingSession]); // Added dependencies

  // Reset function to clear state - wrapped in useCallback for stability
  const reset = useCallback(() => {
    console.log('[TaskDescriptionState] Resetting task description state');
    setTaskDescription("");
    setTaskCopySuccess(false);
    setIsImprovingText(false);
    setTextImprovementJobId(null);
    loadedSessionIdRef.current = null; // Clear the loaded session ID reference
    
    // Also clear the localStorage backup
    try {
      localStorage.removeItem(localStorageKey);
    } catch (error) {
      console.error('[TaskDescriptionState] Error removing localStorage backup:', error);
    }
  }, [setTaskDescription, setTaskCopySuccess, setIsImprovingText, setTextImprovementJobId, localStorageKey]);
  
  // Add useEffect to monitor activeSessionId changes for session switching
  useEffect(() => {
    const previousSessionId = loadedSessionIdRef.current; // Get the ID of the session we are switching FROM

    // This effect runs when activeSessionId prop changes.
    // `taskDescriptionForOutgoingSaveRef.current` holds the task description
    // that was associated with `previousSessionId` just before the switch.

    if (activeSessionId) { // Case 1: Switching TO a new, valid session
      if (activeSessionId !== previousSessionId) {
        // Save the task description of the outgoing session (previousSessionId)
        if (previousSessionId && typeof taskDescriptionForOutgoingSaveRef.current === 'string') {
          const outgoingSessionKey = `task-description-backup-${previousSessionId}`;
          try {
            localStorage.setItem(outgoingSessionKey, taskDescriptionForOutgoingSaveRef.current);
            console.log(`[TaskDescState] Session switch: Saved TD for outgoing session ${previousSessionId} to ${outgoingSessionKey}`);
          } catch (error) {
            console.error(`[TaskDescState] Error saving TD for outgoing session ${previousSessionId}:`, error);
          }
        }

        // Prepare for the new session:
        // 1. Update loadedSessionIdRef to the new activeSessionId.
        loadedSessionIdRef.current = activeSessionId;
        // 2. Clear the taskDescription state. The restore effect (which now uses the new
        //    session-specific localStorageKey due to activeSessionId change) will then attempt
        //    to load the backup for the new session.
        setTaskDescription('');
      }
    } else { // Case 2: Switching TO NO session (activeSessionId is null)
      if (previousSessionId) { // If there was a session active before
        // Save the task description of the outgoing session (previousSessionId)
        if (typeof taskDescriptionForOutgoingSaveRef.current === 'string') {
          const outgoingSessionKey = `task-description-backup-${previousSessionId}`;
          try {
            localStorage.setItem(outgoingSessionKey, taskDescriptionForOutgoingSaveRef.current);
            console.log(`[TaskDescState] Session deactivation: Saved TD for outgoing session ${previousSessionId} to ${outgoingSessionKey}`);
          } catch (error) {
            console.error(`[TaskDescState] Error saving TD for deactivating session ${previousSessionId}:`, error);
          }
        }
        reset(); // reset() will clear taskDescription state and set loadedSessionIdRef.current = null
      }
    }
  }, [activeSessionId, reset]); // This effect should only run when activeSessionId or reset changes.
  
  // Create a debounced version of onInteraction to reduce frequency of calls
  const debouncedInteraction = useMemo(
    () => debounce(() => {
      // Skip triggering interactions during session switching to prevent stale data being saved
      if (isSwitchingSession) {
        console.log('[TaskDescriptionState] Suppressed debounced interaction: session switch in progress');
        return;
      }
      
      if (onInteraction) {
        console.log('[TaskDescriptionState] Triggering debounced interaction for task description changes');
        onInteraction();
      }
    }, 1000), // 1 second debounce for textarea changes
    [onInteraction, isSwitchingSession]
  );

  // Function to load data for a specific session
  const loadDataForSession = useCallback((newDescription: string, sessionId: string) => {
    console.log(`[TaskDescriptionState] Loading TD from DB for session ${sessionId}. TD length: ${newDescription.length}`);
    setTaskDescription(newDescription);
    loadedSessionIdRef.current = sessionId;
  }, []);

  // Function to update task description
  const handleTaskDescriptionChange = useCallback((value: string) => {
    // Set the task description state immediately for UI responsiveness
    setTaskDescription(value);
    
    // Update the last saved content reference
    lastContentRef.current = value;
    
    // Skip notifications during session switching to prevent triggering autosave with stale data
    if (isSwitchingSession) {
      console.log('[TaskDescriptionState] Suppressed interaction notification: session switch in progress');
      return;
    }
    
    // Notify of changes with debouncing
    debouncedInteraction();
  }, [debouncedInteraction, isSwitchingSession]);

  // Store selection range for text improvement
  const selectionRangeRef = useRef<{start: number; end: number; text: string} | null>(null);
  
  // Monitor background job for text improvement
  useEffect(() => {
    // Don't process job updates during session switching to prevent stale data being applied
    if (isSwitchingSession) {
      console.log('[TaskDescriptionState] Suppressed job processing: session switch in progress');
      return;
    }
    
    if (textImprovementJobId && textImprovementJob) {
      if (textImprovementJob.job && textImprovementJob.job.status === 'completed' && textImprovementJob.job.response) {
        // Job completed successfully
        setIsImprovingText(false);
        
        try {
          // Use the global active session ID from context for consistent session identification
          const currentActiveSessionId = globalActiveSessionId || activeSessionId;
          
          // Check if the job belongs to the current active session
          if (textImprovementJob.job.sessionId === currentActiveSessionId) {
            // Parse the response if it's JSON, or use as-is if it's a string
            const improvedText = (() => {
              try {
                const parsed = JSON.parse(textImprovementJob.job.response);
                return parsed.text || parsed.improvedText || textImprovementJob.job.response;
              } catch (e) {
                // If not valid JSON, assume it's just a string
                return textImprovementJob.job.response;
              }
            })();
            
            // If we have a valid text response and selection range
            if (typeof improvedText === 'string' && improvedText.trim() && selectionRangeRef.current) {
              const { start, end } = selectionRangeRef.current;
              
              // Directly update the state with the new value by replacing the selected portion
              const currentValue = taskDescription;
              const newValue = currentValue.substring(0, start) + improvedText + currentValue.substring(end);
              
              // Update the task description with the new value
              setTaskDescription(newValue);
              
              showNotification({
                title: "Text improved",
                message: "The selected text has been improved.",
                type: "success"
              });
            } else {
              console.error("[TaskDescriptionState] Invalid improved text format:", improvedText);
              showNotification({
                title: "Text improvement error",
                message: "Received invalid format for improved text or missing selection range.",
                type: "error"
              });
            }
          } else {
            console.warn('[TaskDescriptionState] Text improvement for a non-active session completed. Ignoring update.');
          }
        } catch (error) {
          console.error("[TaskDescriptionState] Error processing text improvement response:", error);
          showNotification({
            title: "Error processing improvement",
            message: "Failed to process the improved text response.",
            type: "error"
          });
        }
        
        // Always reset the job ID and selection range reference after processing completed status
        setTextImprovementJobId(null);
        selectionRangeRef.current = null;
      } else if (textImprovementJob.job && (textImprovementJob.job.status === 'failed' || textImprovementJob.job.status === 'canceled')) {
        // Job failed or was canceled
        setIsImprovingText(false);
        
        // Use the global active session ID from context for consistent session identification
        const currentActiveSessionId = globalActiveSessionId || activeSessionId;
        
        // Only show notification if the job belongs to the current active session
        if (textImprovementJob.job.sessionId === currentActiveSessionId) {
          showNotification({
            title: "Text improvement failed",
            message: textImprovementJob.job.errorMessage || "Failed to improve text.",
            type: "error"
          });
        } else {
          console.warn('[TaskDescriptionState] Text improvement for a non-active session failed/canceled. Suppressing notification.');
        }
        
        // Always reset the job ID and selection range reference after processing failed or canceled status
        setTextImprovementJobId(null);
        selectionRangeRef.current = null;
      }
    }
  }, [textImprovementJob, textImprovementJobId, activeSessionId, globalActiveSessionId, isSwitchingSession, showNotification, taskDescription]);

  // Handle text improvement
  const handleImproveSelection = useCallback(async (selectedText: string, selectionStart?: number, selectionEnd?: number): Promise<void> => {
    if (!selectedText || selectedText.trim() === '') {
      showNotification({
        title: "No text selected",
        message: "Please select some text to improve.",
        type: "warning"
      });
      return;
    }
    
    if (isImprovingText) {
      showNotification({
        title: "Already improving text",
        message: "Please wait for the current improvement to complete.",
        type: "warning"
      });
      return;
    }
    
    // Prevent text improvement during session switching
    if (isSwitchingSession) {
      showNotification({
        title: "Session switching in progress",
        message: "Please wait for session switch to complete before improving text.",
        type: "warning"
      });
      return;
    }
    
    // Use the global active session ID from context for consistency
    const currentActiveSessionId = globalActiveSessionId || activeSessionId;
    
    // Validate that currentActiveSessionId is a string
    if (currentActiveSessionId !== null && typeof currentActiveSessionId !== 'string') {
      console.error(`[TaskDescriptionState] Invalid activeSessionId type: ${typeof currentActiveSessionId}, value:`, currentActiveSessionId);
      showNotification({
        title: "Error",
        message: "Invalid session ID format",
        type: "error"
      });
      return;
    }
    
    setIsImprovingText(true);
    
    try {
      console.log("[TaskDescriptionState] Improving selected text:", selectedText.substring(0, 50) + "...");
      
      // If we have selection start and end positions, store them for later use
      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
        console.log(`[TaskDescriptionState] Storing selection range: ${selectionStart}-${selectionEnd}`);
        selectionRangeRef.current = {
          start: selectionStart,
          end: selectionEnd,
          text: selectedText
        };
      } else if (taskDescriptionRef.current) {
        // Try to get selection from the textarea element
        const start = taskDescriptionRef.current.selectionStart;
        const end = taskDescriptionRef.current.selectionEnd;
        
        if (typeof start === 'number' && typeof end === 'number') {
          console.log(`[TaskDescriptionState] Getting selection range from textarea: ${start}-${end}`);
          selectionRangeRef.current = {
            start,
            end,
            text: selectedText
          };
        } else {
          // Fallback: try to find the text in the task description
          console.log(`[TaskDescriptionState] No selection range provided, searching for text in task description`);
          const index = taskDescription.indexOf(selectedText);
          if (index >= 0) {
            selectionRangeRef.current = {
              start: index,
              end: index + selectedText.length,
              text: selectedText
            };
          } else {
            console.warn("[TaskDescriptionState] Couldn't determine selection range for text improvement");
            selectionRangeRef.current = null;
          }
        }
      }
      
      // Ensure we pass the text correctly to the action with targetField
      const result = await improveSelectedTextAction({
        text: selectedText,
        sessionId: currentActiveSessionId, // Use the consistent session ID from context
        projectDirectory, // Include project directory
        targetField: 'taskDescription' // Explicitly set targetField
      });
      
      if (result.isSuccess) {
        // Check for background job format
        if (result.data && typeof result.data === 'object' && 'isBackgroundJob' in result.data && result.data.jobId) {
          console.log("[TaskDescriptionState] Text improvement queued as background job:", result.data.jobId);
          setTextImprovementJobId(result.data.jobId);
        } else if (typeof result.data === 'string') {
          // Handle immediate text improvement result
          console.log("[TaskDescriptionState] Text improvement completed immediately");
          
          // Check if we have a valid selection range and apply the improved text
          if (selectionRangeRef.current) {
            const { start, end } = selectionRangeRef.current;
            const currentValue = taskDescription;
            const newValue = currentValue.substring(0, start) + result.data + currentValue.substring(end);
            
            // Update the task description with the new value
            setTaskDescription(newValue);
            selectionRangeRef.current = null;
          }
          
          showNotification({
            title: "Text improved",
            message: "The selected text has been improved.",
            type: "success"
          });
          
          setIsImprovingText(false);
        } else {
          // Unexpected data format but still success
          console.warn("[TaskDescriptionState] Unexpected success data format:", result.data);
          setIsImprovingText(false);
          selectionRangeRef.current = null;
          
          showNotification({
            title: "Text improvement result",
            message: "Received unexpected result format.",
            type: "warning"
          });
        }
      } else {
        // Handle unsuccessful result
        throw new Error(result.message || "Failed to start text improvement.");
      }
    } catch (error) {
      console.error("[TaskDescriptionState] Error improving text:", error);
      setIsImprovingText(false);
      selectionRangeRef.current = null;
      
      showNotification({
        title: "Error improving text",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
    }
  }, [isImprovingText, showNotification, activeSessionId, globalActiveSessionId, isSwitchingSession, taskDescription, taskDescriptionRef, projectDirectory]);

  // Function to copy task description to clipboard
  const copyTaskDescription = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(taskDescription);
      setTaskCopySuccess(true);
      
      // Reset the copy success state after a delay
      setTimeout(() => {
        setTaskCopySuccess(false);
      }, 2000);
      
      return true;
    } catch (error) {
      console.error("[TaskDescriptionState] Error copying task description:", error);
      return false;
    }
  }, [taskDescription]);

  return useMemo(() => ({
    // State
    taskDescription,
    isImprovingText,
    textImprovementJobId,
    taskCopySuccess,
    taskDescriptionRef,
    
    // Actions
    setTaskDescription: handleTaskDescriptionChange,
    handleImproveSelection,
    copyTaskDescription,
    reset,
    loadDataForSession
  }), [
    // State values
    taskDescription,
    isImprovingText,
    textImprovementJobId,
    taskCopySuccess,
    taskDescriptionRef,
    
    // Stable callback functions
    handleTaskDescriptionChange,
    handleImproveSelection,
    copyTaskDescription,
    reset,
    loadDataForSession
  ]);
} 
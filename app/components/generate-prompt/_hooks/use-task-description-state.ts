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
  // Core state
  const [taskDescription, setTaskDescription] = useState("");
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [textImprovementJobId, setTextImprovementJobId] = useState<string | null>(null);
  
  // Refs
  const lastContentRef = useRef<string>('');
  
  // External hooks
  const { showNotification } = useNotification();
  const { projectDirectory } = useProject();
  // Fetch the background job
  const textImprovementJob = useBackgroundJob(textImprovementJobId);
  
  // Generate localStorage key for taskDescription backup
  const localStorageKey = useMemo(() => {
    return `task-description-backup-${encodeURIComponent(projectDirectory || 'default')}`;
  }, [projectDirectory]);

  // Initialize from local storage on mount
  useEffect(() => {
    try {
      // Only restore from backup if current value is empty
      if (!taskDescription || taskDescription.trim() === '') {
        const backup = localStorage.getItem(localStorageKey);
        if (backup && backup.length > 0) {
          console.log('[TaskDescriptionState] Restoring from local storage backup:', localStorageKey, 
            `(first ${backup.substring(0, 20)}... of ${backup.length} chars)`);
          setTaskDescription(backup);
          if (onInteraction) onInteraction();
        } else {
          console.log('[TaskDescriptionState] No local storage backup found or backup is empty');
        }
      } else {
        console.log('[TaskDescriptionState] Not restoring from local storage - value already exists:', 
          `(first ${taskDescription.substring(0, 20)}... of ${taskDescription.length} chars)`);
      }
    } catch (error) {
      console.error('[TaskDescriptionState] Error accessing localStorage:', error);
    }
  }, [localStorageKey, taskDescription, setTaskDescription, onInteraction]);

  // Update local storage when value changes
  useEffect(() => {
    try {
      if (taskDescription && taskDescription.trim() !== '') {
        console.log('[TaskDescriptionState] Saving to localStorage:', localStorageKey, `(${taskDescription.length} chars)`);
        localStorage.setItem(localStorageKey, taskDescription);
      }
    } catch (error) {
      console.error('[TaskDescriptionState] Error saving to localStorage:', error);
    }
  }, [taskDescription, localStorageKey]);

  // Reset function to clear state - wrapped in useCallback for stability
  const reset = useCallback(() => {
    console.log('[TaskDescriptionState] Resetting task description state');
    setTaskDescription("");
    setTaskCopySuccess(false);
    setIsImprovingText(false);
    setTextImprovementJobId(null);
    
    // Also clear the localStorage backup
    try {
      localStorage.removeItem(localStorageKey);
    } catch (error) {
      console.error('[TaskDescriptionState] Error removing localStorage backup:', error);
    }
  }, [setTaskDescription, setTaskCopySuccess, setIsImprovingText, setTextImprovementJobId, localStorageKey]);
  
  // Add useEffect to monitor activeSessionId changes for automatic reset
  useEffect(() => {
    // When activeSessionId changes to null, reset the state
    if (activeSessionId === null) {
      console.log('[TaskDescriptionState] Session ID set to null, resetting task description state');
      reset();
    }
    
    // No need to do anything when activeSessionId changes to a non-null value
    // as data will be loaded by the session loading handler
  }, [activeSessionId, reset]);
  
  // Create a debounced version of onInteraction to reduce frequency of calls
  const debouncedInteraction = useMemo(
    () => debounce(() => {
      if (onInteraction) {
        console.log('[TaskDescriptionState] Triggering debounced interaction for task description changes');
        onInteraction();
      }
    }, 1000), // 1 second debounce for textarea changes
    [onInteraction]
  );

  // Function to update task description
  const handleTaskDescriptionChange = useCallback((value: string) => {
    // Set the task description state immediately for UI responsiveness
    setTaskDescription(value);
    
    // Update the last saved content reference
    lastContentRef.current = value;
    
    // Notify of changes with debouncing
    debouncedInteraction();
  }, [debouncedInteraction]);

  // Store selection range for text improvement
  const selectionRangeRef = useRef<{start: number; end: number; text: string} | null>(null);
  
  // Monitor background job for text improvement
  useEffect(() => {
    if (textImprovementJobId && textImprovementJob) {
      if (textImprovementJob.job && textImprovementJob.job.status === 'completed' && textImprovementJob.job.response) {
        // Job completed successfully
        setIsImprovingText(false);
        
        try {
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
            
            // Clear the selection range reference
            selectionRangeRef.current = null;
            
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
        } catch (error) {
          console.error("[TaskDescriptionState] Error processing text improvement response:", error);
          showNotification({
            title: "Error processing improvement",
            message: "Failed to process the improved text response.",
            type: "error"
          });
        }
        
        // Always reset the job ID after processing completed status
        setTextImprovementJobId(null);
      } else if (textImprovementJob.job && (textImprovementJob.job.status === 'failed' || textImprovementJob.job.status === 'canceled')) {
        // Job failed
        setIsImprovingText(false);
        
        showNotification({
          title: "Text improvement failed",
          message: textImprovementJob.job.errorMessage || "Failed to improve text.",
          type: "error"
        });
        
        // Always reset the job ID after processing failed or canceled status
        setTextImprovementJobId(null);
        
        // Clear the selection range reference
        selectionRangeRef.current = null;
      }
    }
  }, [textImprovementJob, textImprovementJobId, showNotification, taskDescription]);

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
    
    // Validate that activeSessionId is a string
    if (activeSessionId !== null && typeof activeSessionId !== 'string') {
      console.error(`[TaskDescriptionState] Invalid activeSessionId type: ${typeof activeSessionId}, value:`, activeSessionId);
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
        sessionId: activeSessionId,
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
  }, [isImprovingText, showNotification, activeSessionId, taskDescription, taskDescriptionRef, projectDirectory]);

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
    reset
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
    reset
  ]);
} 
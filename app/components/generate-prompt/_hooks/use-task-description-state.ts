"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useBackgroundJob } from "@/lib/contexts/background-jobs-context";
import { improveSelectedTextAction } from "@/actions/text-improvement-actions";
import { useNotification } from '@/lib/contexts/notification-context';
import { AUTO_SAVE_INTERVAL } from "@/lib/constants";
import debounce from '@/lib/utils/debounce';
import { sessionSyncService } from '@/lib/services/session-sync-service';

interface UseTaskDescriptionStateProps {
  activeSessionId: string | null;
  onInteraction?: () => void;
  setHasUnsavedChanges?: (value: boolean) => void;
}

export function useTaskDescriptionState({
  activeSessionId,
  onInteraction,
  setHasUnsavedChanges
}: UseTaskDescriptionStateProps) {
  // State
  const [taskDescription, setTaskDescription] = useState("");
  const [isImprovingText, setIsImprovingText] = useState(false);
  const [textImprovementJobId, setTextImprovementJobId] = useState<string | null>(null);
  const [taskCopySuccess, setTaskCopySuccess] = useState(false);
  
  // Refs
  const taskDescriptionRef = useRef<any>(null);
  const saveTaskDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // External hooks
  const { showNotification } = useNotification();
  const textImprovementJob = useBackgroundJob(textImprovementJobId);

  // Reset function to clear all state
  const reset = useCallback(() => {
    console.log('[TaskDescriptionState] Resetting task description state');
    setTaskDescription("");
    setIsImprovingText(false);
    setTextImprovementJobId(null);
    setTaskCopySuccess(false);
    
    // Clear any pending timers
    if (saveTaskDebounceTimer.current) {
      clearTimeout(saveTaskDebounceTimer.current);
      saveTaskDebounceTimer.current = null;
    }
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  }, []);

  // Setup auto-save for task description
  // Function to save task description to the session
  const saveTaskDescription = useCallback(async (sessionId: string | null) => {
    if (!sessionId || !taskDescription) return;
    
    // Reset the auto-save timer
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    
    try {
      console.log(`[TaskDescriptionState] Saving task description for session: ${sessionId}, length: ${taskDescription.length}`);
      
      // Add timestamp tracking to identify rapid calls
      const now = Date.now();
      const lastCallTime = (saveTaskDescription as any).lastCallTime || 0;
      const timeSinceLastCall = now - lastCallTime;
      (saveTaskDescription as any).lastCallTime = now;
      
      // Prevent too frequent saves - minimum 8 seconds between saves
      if (timeSinceLastCall < 1000) {
        console.warn(`[TaskDescriptionState] Throttling: saveTaskDescription called again after only ${timeSinceLastCall}ms, deferring save`);
        
        // Schedule a delayed save instead of immediate save
        autoSaveTimeoutRef.current = setTimeout(() => {
          saveTaskDescription(sessionId);
        }, 2000); // Retry after 2 seconds instead of 10 seconds
        
        return;
      }
      
      await sessionSyncService.updateSessionState(
        sessionId,
        {
          taskDescription
        }
      );
      
      // Reset unsaved changes flag if present
      if (setHasUnsavedChanges) {
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      console.error(`[TaskDescriptionState] Error saving task description:`, error);
    } finally {
      // Only set up the next auto-save if there isn't already one scheduled
      if (!autoSaveTimeoutRef.current) {
        autoSaveTimeoutRef.current = setTimeout(() => {
          saveTaskDescription(sessionId);
        }, AUTO_SAVE_INTERVAL * 2); // Double the regular interval for auto-save
      }
    }
  }, [taskDescription, setHasUnsavedChanges]);

  useEffect(() => {
    if (activeSessionId) {
      // Clear any existing timeout before setting a new one
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveTaskDescription(activeSessionId);
      }, AUTO_SAVE_INTERVAL);
    }
    
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [activeSessionId, saveTaskDescription]);
  
  // Monitor background job for text improvement
  useEffect(() => {
    if (textImprovementJobId && textImprovementJob) {
      if (textImprovementJob.status === 'completed' && textImprovementJob.response) {
        // Job completed successfully
        setIsImprovingText(false);
        
        try {
          // Parse the response if it's JSON, or use as-is if it's a string
          const improvedText = (() => {
            try {
              const parsed = JSON.parse(textImprovementJob.response);
              return parsed.text || parsed.improvedText || textImprovementJob.response;
            } catch (e) {
              // If not valid JSON, assume it's just a string
              return textImprovementJob.response;
            }
          })();
          
          // If we have a valid text response
          if (typeof improvedText === 'string' && improvedText.trim()) {
            // If we have a textarea ref, replace the selected text
            if (taskDescriptionRef.current) {
              // Using replaceSelection function if available
              if (typeof taskDescriptionRef.current.replaceSelection === 'function') {
                taskDescriptionRef.current.replaceSelection(improvedText);
              } else {
                console.log("[TaskDescriptionState] No replaceSelection method available on ref");
              }
            } else {
              console.log("[TaskDescriptionState] No textarea ref available to apply improved text");
            }
            
            showNotification({
              title: "Text improved",
              message: "The selected text has been improved.",
              type: "success"
            });
          } else {
            console.error("[TaskDescriptionState] Invalid improved text format:", improvedText);
            showNotification({
              title: "Text improvement error",
              message: "Received invalid format for improved text.",
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
      } else if (textImprovementJob.status === 'failed' || textImprovementJob.status === 'canceled') {
        // Job failed
        setIsImprovingText(false);
        
        showNotification({
          title: "Text improvement failed",
          message: textImprovementJob.errorMessage || "Failed to improve text.",
          type: "error"
        });
        
        // Always reset the job ID after processing failed or canceled status
        setTextImprovementJobId(null);
      }
    }
  }, [textImprovementJob, textImprovementJobId, showNotification, taskDescriptionRef]);

  // Create a memoized debounced version of saveTaskDescription
  const debouncedSaveTaskDescription = useCallback((sessionId: string | null) => {
    const debouncedFn = debounce((id: string | null) => {
      console.log('[TaskDescriptionState] Debounced save triggered');
      saveTaskDescription(id);
    }, 1000);
    
    debouncedFn(sessionId);
  }, [saveTaskDescription]);

  // Track last saved content for comparison
  const lastSavedContentRef = useRef<string>('');

  // Handle task description change
  const handleTaskDescriptionChange = useCallback((value: string) => {
    setTaskDescription(value);
    
    if (onInteraction) {
      onInteraction();
    }
    
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
    
    // Skip debounced save if content hasn't changed significantly
    if (activeSessionId && value !== lastSavedContentRef.current) {
      // Only trigger save if:
      // 1. Changed by at least 10 characters or
      // 2. It's been at least 5 seconds since last save
      const contentChangeMagnitude = Math.abs(value.length - lastSavedContentRef.current.length);
      const timeSinceLastSave = Date.now() - ((debouncedSaveTaskDescription as any).lastSaveTime || 0);
      
      const shouldSaveContent = contentChangeMagnitude > 10;
      const shouldSaveTime = timeSinceLastSave > 5000;
      
      if (shouldSaveContent || shouldSaveTime) {
        console.log(`[TaskDescriptionState] Triggering save - content change: ${contentChangeMagnitude} chars, time since last: ${timeSinceLastSave}ms`);
        debouncedSaveTaskDescription(activeSessionId);
        (debouncedSaveTaskDescription as any).lastSaveTime = Date.now();
        lastSavedContentRef.current = value;
      } else {
        console.log(`[TaskDescriptionState] Skipping save - insufficient changes (${contentChangeMagnitude} chars, ${timeSinceLastSave}ms)`);
      }
    }
  }, [activeSessionId, debouncedSaveTaskDescription, onInteraction, setHasUnsavedChanges]);

  // Handle text improvement
  const handleImproveSelection = useCallback(async (selectedText: string): Promise<void> => {
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
      
      // Ensure we pass the text correctly to the action
      const result = await improveSelectedTextAction({
        text: selectedText,
        sessionId: activeSessionId
      });
      
      if (result.isSuccess) {
        // Check for background job format
        if (result.data && typeof result.data === 'object' && 'isBackgroundJob' in result.data && result.data.jobId) {
          console.log("[TaskDescriptionState] Text improvement queued as background job:", result.data.jobId);
          setTextImprovementJobId(result.data.jobId);
        } else if (typeof result.data === 'string') {
          // Handle immediate text improvement result
          console.log("[TaskDescriptionState] Text improvement completed immediately");
          showNotification({
            title: "Text improved",
            message: "The selected text has been improved.",
            type: "success"
          });
          // The parent component will handle replacing the text
          setIsImprovingText(false);
        } else {
          // Unexpected data format but still success
          console.warn("[TaskDescriptionState] Unexpected success data format:", result.data);
          setIsImprovingText(false);
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
      
      showNotification({
        title: "Error improving text",
        message: error instanceof Error ? error.message : "An unknown error occurred.",
        type: "error"
      });
    }
  }, [isImprovingText, showNotification, activeSessionId]);

  // Function to save task description immediately
  const saveTaskDescriptionImmediately = useCallback(async () => {
    if (activeSessionId) {
      await saveTaskDescription(activeSessionId);
    }
  }, [activeSessionId, saveTaskDescription]);

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
    saveTaskDescription: saveTaskDescriptionImmediately,
    copyTaskDescription,
    reset
  }), [
    taskDescription,
    isImprovingText,
    textImprovementJobId,
    taskCopySuccess,
    handleTaskDescriptionChange,
    handleImproveSelection,
    saveTaskDescriptionImmediately,
    copyTaskDescription,
    reset
  ]);
} 
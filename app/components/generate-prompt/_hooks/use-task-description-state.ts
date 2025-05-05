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
  taskDescriptionRef: React.RefObject<HTMLTextAreaElement>;
}

export function useTaskDescriptionState({
  activeSessionId,
  onInteraction,
  setHasUnsavedChanges,
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
  // Fetch the background job
  const textImprovementJob = useBackgroundJob(textImprovementJobId);
  
  // Reset function to clear state
  const reset = useCallback(() => {
    console.log('[TaskDescriptionState] Resetting task description state');
    setTaskDescription("");
    setTaskCopySuccess(false);
    setIsImprovingText(false);
    setTextImprovementJobId(null);
  }, []);
  
  // Function to update task description
  const handleTaskDescriptionChange = useCallback((value: string) => {
    // Set the task description state
    setTaskDescription(value);
    
    // Update the last saved content reference
    lastContentRef.current = value;
    
    // Notify of changes
    if (onInteraction) {
      onInteraction();
    }
    
    // Mark as having unsaved changes
    if (setHasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
  }, [onInteraction, setHasUnsavedChanges]);

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
          
          // If we have a valid text response
          if (typeof improvedText === 'string' && improvedText.trim()) {
            // If we have a textarea ref, replace the selected text
            if (taskDescriptionRef.current) {
              // Since HTMLTextAreaElement doesn't have a replaceSelection method, 
              // we need to manually handle the text replacement
              const textarea = taskDescriptionRef.current;
              const start = textarea.selectionStart;
              const end = textarea.selectionEnd;
              
              if (start !== null && end !== null) {
                const currentValue = textarea.value || '';
                const newValue = currentValue.substring(0, start) + improvedText + currentValue.substring(end);
                
                // Update the task description with the new value
                setTaskDescription(newValue);
                
                // Restore selection after the update (focusing on the end of the newly inserted text)
                setTimeout(() => {
                  if (textarea && typeof textarea.focus === 'function') {
                    textarea.focus();
                    const newCursorPos = start + improvedText.length;
                    if (typeof textarea.setSelectionRange === 'function') {
                      textarea.setSelectionRange(newCursorPos, newCursorPos);
                    }
                  }
                }, 0);
              } else {
                console.log("[TaskDescriptionState] Cannot determine selection range in textarea");
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
      }
    }
  }, [textImprovementJob, textImprovementJobId, showNotification, taskDescriptionRef]);

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
    taskDescription,
    isImprovingText,
    textImprovementJobId,
    taskCopySuccess,
    handleTaskDescriptionChange,
    handleImproveSelection,
    copyTaskDescription,
    reset,
    taskDescriptionRef
  ]);
} 
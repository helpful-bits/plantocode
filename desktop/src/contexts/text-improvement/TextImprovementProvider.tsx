"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

import { useSessionStateContext } from "@/contexts/session";
import { useProject } from "@/contexts/project-context";
import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { createImproveTextJobAction } from "@/actions/ai/text-improvement.actions";
import { logError } from "@/utils/error-handling";

interface TextImprovementContextType {
  isVisible: boolean;
  position: { top: number; left: number };
  isImproving: boolean;
  jobId: string | null;
  triggerImprovement: () => Promise<void>;
}

const TextImprovementContext = createContext<TextImprovementContextType | null>(null);

export function useTextImprovementContext(): TextImprovementContextType {
  const context = useContext(TextImprovementContext);
  if (!context) {
    const error = new Error(
      "useTextImprovementContext must be used within a TextImprovementProvider"
    );
    logError(error, "TextImprovementContext - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
}

interface TextImprovementProviderProps {
  children: ReactNode;
}

export function TextImprovementProvider({ children }: TextImprovementProviderProps) {
  const { sessionBasicFields } = useSessionStateContext();
  const { projectDirectory } = useProject();
  
  // State for popover visibility and position
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  
  // Internal state for tracking selection
  const [selectedText, setSelectedText] = useState("");
  const [targetElement, setTargetElement] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [targetMonacoEditor, setTargetMonacoEditor] = useState<any>(null);
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  
  // Monitor background job status
  const { job, status } = useBackgroundJob(jobId);
  const isImproving = status === "running" || status === "queued" || status === "created";

  // Hide popover when job completes and apply improvements
  useEffect(() => {
    if (job && status === "completed" && job.response) {
      try {
        // Get the improved text from job response
        const improvedText = job.response;
        
        if (targetMonacoEditor) {
          // Handle Monaco Editor
          const selection = targetMonacoEditor.getSelection();
          if (selection) {
            targetMonacoEditor.executeEdits('text-improvement', [{
              range: selection,
              text: improvedText,
              forceMoveMarkers: true
            }]);
          }
        } else if (targetElement) {
          // Handle regular input/textarea elements
          const currentValue = targetElement.value;
          
          // Check if the text in the selection range has changed while the job was running
          const currentSelectionText = currentValue.slice(selectionRange.start, selectionRange.end);
          if (currentSelectionText !== selectedText) {
            // Text has been modified by user while job was running, skip applying improvement
            console.warn("Text was modified while improvement job was running, skipping application");
          } else {
            const newValue = 
              currentValue.slice(0, selectionRange.start) + 
              improvedText + 
              currentValue.slice(selectionRange.end);
            
            // Use native value setter to properly update React controlled components
            const valueSetter = Object.getOwnPropertyDescriptor(targetElement, 'value') || 
                              Object.getOwnPropertyDescriptor(Object.getPrototypeOf(targetElement), 'value');
            if (valueSetter && valueSetter.set) {
              valueSetter.set.call(targetElement, newValue);
            }
            
            // Dispatch single input event to notify React of the change
            const inputEvent = new Event('input', { bubbles: true });
            targetElement.dispatchEvent(inputEvent);
          }
        }
        
        // Reset state
        setIsVisible(false);
        setJobId(null);
        setSelectedText("");
        setTargetElement(null);
        setTargetMonacoEditor(null);
        setSelectionRange({ start: 0, end: 0 });
      } catch (error) {
        console.error("Error applying text improvement:", error);
        // Still hide popover on error
        setIsVisible(false);
        setJobId(null);
      }
    }
  }, [job, status, targetElement, targetMonacoEditor, selectionRange, selectedText]);

  // Handle Monaco Editor selection events
  const handleMonacoSelection = useCallback((event: CustomEvent) => {
    const { editor, selection } = event.detail;
    
    try {
      const model = editor.getModel();
      if (selection && model && !selection.isEmpty()) {
        const selectedText = model.getValueInRange(selection);
        
        if (selectedText.trim()) {
          // Position near the editor
          const editorElement = document.querySelector('.monaco-editor.focused') as HTMLElement;
          let popoverPosition = { top: 100, left: 100 }; // Default fallback
          
          if (editorElement) {
            const rect = editorElement.getBoundingClientRect();
            popoverPosition = {
              top: rect.top + 40,
              left: rect.left + 60,
            };
          }

          setPosition(popoverPosition);
          setSelectedText(selectedText);
          setTargetElement(null);
          setTargetMonacoEditor(editor);
          setSelectionRange({ start: 0, end: 0 }); // Not needed for Monaco
          setIsVisible(true);
          return;
        }
      }
    } catch (error) {
      console.debug('Error handling Monaco selection:', error);
    }
    
    // Hide if no valid selection
    setIsVisible(false);
  }, []);

  // Handle selection detection for regular input/textarea elements
  const handleSelectionCheck = useCallback((mouseEvent?: MouseEvent) => {
    // Use a short timeout to allow the active element and selection to update.
    setTimeout(() => {
      const activeElement = document.activeElement;

      // Only handle regular input/textarea elements here
      if (
        activeElement &&
        (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
      ) {
        const targetInput = activeElement;
        
        const { selectionStart, selectionEnd, value } = targetInput;

        // Check for a valid, non-empty selection.
        if (
          typeof selectionStart === 'number' &&
          typeof selectionEnd === 'number' &&
          selectionStart !== selectionEnd
        ) {
          const selectedText = value.substring(selectionStart, selectionEnd);

          if (selectedText.trim()) {
            // Position the popover using mouse coordinates if available, 
            // otherwise position near the input element
            let popoverPosition;
            if (mouseEvent) {
              popoverPosition = {
                top: mouseEvent.clientY + 8,
                left: mouseEvent.clientX,
              };
            } else {
              // For keyboard selections, position near the input element
              const rect = targetInput.getBoundingClientRect();
              popoverPosition = {
                top: rect.bottom + 8,
                left: rect.left,
              };
            }

            setPosition(popoverPosition);
            setSelectedText(selectedText);
            setTargetElement(targetInput);
            setTargetMonacoEditor(null);
            setSelectionRange({ start: selectionStart, end: selectionEnd });
            setIsVisible(true);
            return;
          }
        }
      }

      // If no valid selection is found, hide the popover.
      setIsVisible(false);
    }, 10);
  }, [
    setPosition,
    setSelectedText,
    setTargetElement,
    setTargetMonacoEditor,
    setSelectionRange,
    setIsVisible,
  ]);

  // Handle mouseup events to check for text selection
  const handleMouseUp = useCallback((event: MouseEvent) => {
    const targetElement = event.target as Element;

    // If the click is on the popover itself, do nothing.
    if (targetElement.closest('[data-text-improvement-popover]')) {
      return;
    }

    handleSelectionCheck(event);
  }, [handleSelectionCheck]);

  // Handle selection changes (including keyboard selections like Ctrl+A)
  const handleSelectionChange = useCallback(() => {
    handleSelectionCheck();
  }, [handleSelectionCheck]);

  // Handle scroll events to hide popover
  const handleScroll = useCallback(() => {
    setIsVisible(false);
  }, [setIsVisible]);

  // Set up event listeners
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('monaco-selection-change', handleMonacoSelection as EventListener);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('monaco-selection-change', handleMonacoSelection as EventListener);
    };
  }, [handleMouseUp, handleSelectionChange, handleScroll, handleMonacoSelection]);

  // Trigger text improvement
  const triggerImprovement = useCallback(async () => {
    if (!selectedText) {
      console.error("No text selected for improvement");
      setIsVisible(false);
      return;
    }

    if (!sessionBasicFields.id) {
      console.error("No active session for text improvement");
      setIsVisible(false);
      return;
    }

    try {
      const result = await createImproveTextJobAction({
        text: selectedText,
        sessionId: sessionBasicFields.id,
        projectDirectory,
      });

      if (result.isSuccess && result.data?.jobId) {
        setJobId(result.data.jobId);
      } else {
        console.error("Failed to start text improvement job:", result.message);
        setIsVisible(false);
      }
    } catch (error) {
      console.error("Error triggering text improvement:", error);
      setIsVisible(false);
    }
  }, [selectedText, sessionBasicFields.id, projectDirectory]);

  const contextValue = useMemo<TextImprovementContextType>(() => ({
    isVisible,
    position,
    isImproving,
    jobId,
    triggerImprovement,
  }), [isVisible, position, isImproving, jobId, triggerImprovement]);

  return (
    <TextImprovementContext.Provider value={contextValue}>
      {children}
    </TextImprovementContext.Provider>
  );
}
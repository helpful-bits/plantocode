"use client";

import React, { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { improveSelectedTextAction } from "@/actions/text-improvement-actions";
import { useBackgroundJobs, useBackgroundJob } from "@/lib/contexts/background-jobs-context";

import { useNotification } from '@/lib/contexts/notification-context';

export interface TaskDescriptionHandle {
  insertTextAtCursorPosition: (text: string) => void;
  appendText: (text: string) => void;
  replaceSelection: (newText: string) => void;
}

// Define props for the component
interface TaskDescriptionProps {
  value: string;
  onChange: (value: string) => void;
  onInteraction: () => void; // Callback for interaction
  isImproving?: boolean;
  textImprovementJobId?: string | null;
  onImproveSelection?: (selectedText: string) => Promise<void>;
}

export default React.memo(forwardRef<TaskDescriptionHandle, TaskDescriptionProps>(function TaskDescriptionArea({
  value,
  onChange,
  onInteraction,
  isImproving: externalIsImproving,
  textImprovementJobId: externalImproveJobId,
  onImproveSelection: externalImproveSelection,
}: TaskDescriptionProps, ref) { // Keep ref parameter
  // State related to "Improve Selection"
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(0);
  const { showNotification } = useNotification();
  
  // Use only the externally provided state
  const effectiveIsImproving = externalIsImproving || false;
  
  // Only track the external job - handle undefined case
  const improveJob = useBackgroundJob(externalImproveJobId || null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Use window object to get the current URL to create project-specific localStorage keys
  const getProjectPathSegment = () => {
    // Safe access to window object with fallback for SSR
    if (typeof window !== 'undefined') {
      const projectParam = new URLSearchParams(window.location.search).get('project');
      if (projectParam) {
        // Create a safe key fragment from the project path
        return encodeURIComponent(projectParam.replace(/[\/\\?%*:|"<>]/g, '_')).substring(0, 50);
      }
    }
    return 'default';
  };
  
  // Create a project-specific local storage key to prevent conflicts between projects
  const localStorageKey = `task-description-backup-${getProjectPathSegment()}`;
  
  // Insert or replace text at the stored cursor or selection range
  const insertTextAtCursor = useCallback((newText: string, start: number, end: number) => {
    if (!textareaRef.current) {
      console.error("Cannot insert text: textareaRef is not available");
      return;
    }
    
    console.log("Inserting text at cursor:", newText.substring(0, 50) + (newText.length > 50 ? '...' : ''), 
      "position:", start, "to", end);

    // Validate that text is not empty
    if (!newText || newText.trim() === '') {
      console.warn("Attempted to insert empty text");
      return;
    }

    // Calculate the new value directly 
    const originalText = value;
    const before = originalText.slice(0, start);
    const after = originalText.slice(end);
    const newValue = before + newText + after;
    
    // Update state via the onChange prop
    onChange(newValue);
    onInteraction(); // Notify parent
    
    // Update selection state
    const newPosition = start + newText.length;
    setSelectionStart(newPosition);
    setSelectionEnd(newPosition);
    
    // Focus and set selection range after re-render
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  }, [onChange, onInteraction, value]);
  
  // Initialize from local storage on mount
  useEffect(() => {
    try {
      // Only restore from backup if current value is empty
      if (!value || value.trim() === '') {
        const backup = localStorage.getItem(localStorageKey);
        if (backup && backup.length > 0) {
          console.log('[TaskDescription] Restoring from local storage backup:', localStorageKey, `(first ${backup.substring(0, 20)}... of ${backup.length} chars)`);
          onChange(backup);
          onInteraction();
        } else {
          console.log('[TaskDescription] No local storage backup found or backup is empty');
        }
      } else {
        console.log('[TaskDescription] Not restoring from local storage - value already exists:', `(first ${value.substring(0, 20)}... of ${value.length} chars)`);
      }
    } catch (error) {
      console.error('[TaskDescription] Error accessing localStorage:', error);
    }
  }, [localStorageKey, onChange, onInteraction, value]);
  
  // Update local storage when value changes
  useEffect(() => {
    try {
      if (value && value.trim() !== '') {
        console.log('[TaskDescription] Saving to localStorage:', localStorageKey, `(${value.length} chars)`);
        localStorage.setItem(localStorageKey, value);
      }
    } catch (error) {
      console.error('[TaskDescription] Error saving to localStorage:', error);
    }
  }, [value, localStorageKey]);

  // Monitor background job updates for text improvement
  useEffect(() => {
    // Only proceed if we have a job ID and job data, and we're not using external handling
    if (externalImproveJobId && improveJob) {
      if (improveJob.status === 'completed' && improveJob.response) {
        // Validate that the response is a valid string and not a UUID
        if (typeof improveJob.response === 'string' && 
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(improveJob.response)) {
          
          // Get the stored selection positions or use defaults
          const start = selectionStart || 0;
          const end = selectionEnd || 0;
          
          // Insert the improved text from the response field
          insertTextAtCursor(improveJob.response, start, end);
          
          // Updated to use notification context
          showNotification({
            title: "Text improved",
            message: "The selected text has been improved successfully.",
            type: "success"
          });
        } else {
          console.warn("Received invalid improved text:", improveJob.response);
          
          showNotification({
            title: "Text improvement failed",
            message: "Received invalid improved text. Please try again.",
            type: "error"
          });
        }
      } else if (improveJob.status === 'failed' || improveJob.status === 'canceled') {
        // Handle job failure with notification context
        showNotification({
          title: "Text improvement failed",
          message: improveJob.errorMessage || "An error occurred while improving the text.",
          type: "error"
        });
      }
    }
  }, [improveJob, externalImproveJobId, selectionStart, selectionEnd, insertTextAtCursor, showNotification]);

  // Expose methods via ref with simpler implementation that leverages state updates
  useImperativeHandle(ref, () => ({
    insertTextAtCursorPosition: (text: string) => {
      const currentSelectionStart = textareaRef.current?.selectionStart ?? value.length;
      const currentSelectionEnd = textareaRef.current?.selectionEnd ?? value.length;
      insertTextAtCursor(text, currentSelectionStart, currentSelectionEnd);
    },
    appendText: (text: string) => {
      // Append text at the end with 2 new lines in between
      const separator = value.trim().length > 0 ? "\n\n" : "";
      insertTextAtCursor(separator + text, value.length, value.length);
    },
    replaceSelection: (newText: string) => {
      const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
      const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;
      
      if (currentSelectionStart === currentSelectionEnd) {
        console.warn("Cannot replace selection: no text is selected");
        return;
      }
      
      insertTextAtCursor(newText, currentSelectionStart, currentSelectionEnd);
    }
  }));

  // Capture and store the selection positions whenever the user selects text
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionStart(e.currentTarget.selectionStart);
    setSelectionEnd(e.currentTarget.selectionEnd);
  };

  // Handler function to improve selected text - simplified to only use external handler
  const handleImproveSelection = async () => {
    // Only proceed if we have an external handler
    if (!externalImproveSelection) {
      showNotification({
        title: "Not implemented",
        message: "Text improvement is not configured",
        type: "warning"
      });
      return;
    }
    
    // Get the current selection
    const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
    const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;
    
    // Make sure there's actually a selection
    if (currentSelectionStart === currentSelectionEnd) {
      showNotification({
        title: "No text selected",
        message: "Please select some text to improve",
        type: "warning"
      });
      return;
    }
    
    // Get the selected text
    const selectedText = value?.slice(currentSelectionStart, currentSelectionEnd) || "";
    if (!selectedText.trim()) {
      showNotification({
        title: "No text selected",
        message: "Please select some non-empty text to improve",
        type: "warning"
      });
      return;
    }
    
    // Store selection positions for later use when the job completes
    setSelectionStart(currentSelectionStart);
    setSelectionEnd(currentSelectionEnd);
    
    try {
      // Call the parent-provided improvement function
      await externalImproveSelection(selectedText);
    } catch (error) {
      console.error("Error improving text:", error);
      showNotification({
        title: "Error improving text",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        type: "error"
      });
    }
  };

  const hasSelection = !!textareaRef.current && textareaRef.current.selectionStart !== textareaRef.current.selectionEnd;

  // Update handler to ensure local storage backup
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      // Save to local storage immediately
      localStorage.setItem(localStorageKey, e.target.value);
    } catch (error) {
      console.error('[TaskDescription] Error saving to localStorage:', error);
    }
    
    // Call original onChange handler
    onChange(e.target.value);
    onInteraction();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="taskDescArea" className="font-semibold text-lg text-foreground">Task Description:</label>
        <Button
          type="button"
          variant="secondary" size="sm"
          onClick={handleImproveSelection}
          disabled={effectiveIsImproving || !hasSelection}
          className="h-7 text-xs px-2"
        >
          {effectiveIsImproving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1" />)} Improve Selection
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Uses AI to refine the clarity and grammar of the selected text.</p>
      <Textarea // Use the Textarea component
        ref={textareaRef} // Add ref to Textarea
        id="taskDescArea" // Ensure ID matches htmlFor
        className="border rounded bg-background/80 text-foreground p-2 min-h-[150px] w-full resize-y" // Allow vertical resize
        value={value}
        onChange={handleChange} // Use the new handler that includes localStorage backup
        onSelect={handleSelect}
        placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder below or type directly."
      />
    </div>
  );
}));
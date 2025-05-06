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
  isImproving: boolean; // Required prop instead of optional
  onImproveSelection: (selectedText: string, selectionStart?: number, selectionEnd?: number) => Promise<void>; // Required prop instead of optional
}

export default React.memo(forwardRef<TaskDescriptionHandle, TaskDescriptionProps>(function TaskDescriptionArea({
  value,
  onChange,
  onInteraction,
  isImproving,
  onImproveSelection,
}: TaskDescriptionProps, ref) { // Keep ref parameter
  // Minimal state for selection tracking
  const { showNotification } = useNotification();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasActiveSelection, setHasActiveSelection] = useState(false);
  
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
    
    // Calculate new cursor position
    const newPosition = start + newText.length;
    
    // Focus and set selection range after re-render
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  }, [onChange, onInteraction, value]);
  
  // No local storage effects - moved to useTaskDescriptionState hook

  // Removed the duplicate monitor for background job updates
  // This logic is now handled entirely in useTaskDescriptionState.ts

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

  // Track selection in state to properly update the button's disabled status
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    if (textareaRef.current) {
      const { selectionStart, selectionEnd } = textareaRef.current;
      setHasActiveSelection(selectionStart !== selectionEnd);
    } else {
      setHasActiveSelection(false);
    }
  };

  // Handler function to improve selected text - simplified to only use external handler
  const handleImproveSelection = async () => {
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
    
    try {
      // Call the parent-provided improvement function with selection positions
      await onImproveSelection(selectedText, currentSelectionStart, currentSelectionEnd);
    } catch (error) {
      console.error("Error improving text:", error);
      showNotification({
        title: "Error improving text",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        type: "error"
      });
    }
  };

  // The hasSelection const has been replaced by the hasActiveSelection state
  
  // Simplified change handler without localStorage logic
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
          disabled={isImproving || !hasActiveSelection}
          className="h-7 text-xs px-2"
        >
          {isImproving ? (
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
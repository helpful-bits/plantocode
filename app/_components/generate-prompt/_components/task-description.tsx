"use client";

import { useState, useCallback, useRef, useImperativeHandle, forwardRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react"; // Keep Sparkles/Loader2 import
import { improveSelectedTextAction } from "@/actions/text-improvement-actions";

export interface TaskDescriptionHandle {
  insertTextAtCursorPosition: (text: string) => void;
  appendText: (text: string) => void;
}

// Define props for the component
interface TaskDescriptionProps {
  value: string;
  onChange: (value: string) => void;
  onInteraction: () => void; // Callback for interaction
}

export default forwardRef<TaskDescriptionHandle, TaskDescriptionProps>(function TaskDescriptionArea({
  value,
  onChange,
  onInteraction,
}: TaskDescriptionProps, ref) { // Keep ref parameter
  // State related to "Improve Selection"
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(0);
  const [isImproving, setIsImproving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose the insertTextAtCursor method via ref
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
    }
  }));

  // Capture and store the selection positions whenever the user selects text
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionStart(e.currentTarget.selectionStart);
    setSelectionEnd(e.currentTarget.selectionEnd);
  };

  // Insert or replace text at the stored cursor or selection range
  const insertTextAtCursor = useCallback((newText: string, start: number, end: number) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.focus();
    const originalText = textarea.value;


    textarea.setSelectionRange(start, end);

    // Use document.execCommand for better undo support in browsers that support it
    try {
      document.execCommand('insertText', false, newText);
      // Manually dispatch input event to ensure React state updates
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);
    } catch (e) {
      const before = originalText.slice(0, start);
      const after = originalText.slice(end);
      textarea.value = before + newText + after;
      // Manually dispatch input event to ensure React state updates
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event); // Re-dispatch for consistency
    }

    // Ensure state is updated even if execCommand worked
    if (textarea.value !== originalText) {
      onChange(textarea.value);
      onInteraction(); // Notify parent
    }

    const newPosition = start + newText.length;
    textarea.setSelectionRange(newPosition, newPosition);
    setSelectionStart(newPosition); // Update selection state
    setSelectionEnd(newPosition);
  }, [onChange, onInteraction, selectionStart, selectionEnd]);
  // Modify the handler function to not check for canImproveText
  const handleImproveSelection = async () => {
    const originalFocus = document.activeElement; // Remember focus
    const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
    const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;

    if (currentSelectionStart === currentSelectionEnd) return;

    const selectedText = value?.slice(currentSelectionStart, currentSelectionEnd) || "";
    if (!selectedText.trim()) return;

    setIsImproving(true);
    try {
      const result = await improveSelectedTextAction(selectedText);
      if (result.isSuccess && result.data) {
        insertTextAtCursor(result.data, currentSelectionStart, currentSelectionEnd);
        // insertTextAtCursor already calls onChange
      }
      // Reset selection after improving text
      setSelectionStart(textareaRef.current?.selectionStart || 0);
      setSelectionEnd(textareaRef.current?.selectionStart || 0);
    } catch (error) {
      console.error("Error improving text:", error);
    } finally {
      // Restore focus if textarea had it
      if (originalFocus === textareaRef.current) textareaRef.current?.focus();
      setIsImproving(false);
    }
  };

  const hasSelection = !!textareaRef.current && textareaRef.current.selectionStart !== textareaRef.current.selectionEnd; // Keep this check

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="taskDescArea" className="font-semibold text-lg text-foreground">Task Description:</label>
        <Button
          type="button"
          variant="secondary" size="sm"
          onClick={handleImproveSelection} // Keep onClick handler
          disabled={isImproving || !hasSelection}
          className="h-7 text-xs px-2"
        >
          {isImproving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1" />)} Improve Selection
        </Button>
      </div>
      <Textarea // Use the Textarea component
        ref={textareaRef} // Add ref to Textarea
        id="taskDescArea" // Ensure ID matches htmlFor
        className="border rounded bg-background/80 text-foreground p-2 min-h-[150px] w-full resize-y" // Allow vertical resize
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onInteraction(); // Notify parent of interaction
        }}
        onSelect={handleSelect}
        placeholder="Describe what changes you want to make..."
      />
    </div>
  );
}); 
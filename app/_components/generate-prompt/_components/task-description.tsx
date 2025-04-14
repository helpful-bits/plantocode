"use client";

import { useState, useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { improveSelectedTextAction } from "@/actions/text-improvement-actions";

interface TaskDescriptionProps {
  value: string;
  onChange: (value: string) => void; // Callback for parent state update
  onInteraction: () => void; // Callback for interaction
} // Added interface definition

export default function TaskDescriptionArea({
  value,
  onChange,
  onInteraction,
}: TaskDescriptionProps) {
  // State related to "Improve Selection" (kept but maybe disabled if API key isn't present)
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(0);
  const [isImproving, setIsImproving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    // Check if the selection range is still valid
    if (start > originalText.length || end > originalText.length) {
      console.warn("Selection range is out of bounds. Inserting at the end.");
      start = originalText.length;
      end = originalText.length;
    }

    textarea.setSelectionRange(start, end);

    // Use document.execCommand for better undo support in browsers that support it
    try {
      document.execCommand('insertText', false, newText);
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);
    } catch (e) {
      const before = originalText.slice(0, start);
      const after = originalText.slice(end);
      textarea.value = before + newText + after;
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event); // Re-dispatch for consistency
    }

    // Ensure state is updated even if execCommand worked
    if (textarea.value !== originalText) {
      onChange(textarea.value);
      onInteraction(); // Notify parent about interaction
    }

    const newPosition = start + newText.length;
    textarea.setSelectionRange(newPosition, newPosition);
    setSelectionStart(newPosition); // Update selection state
    setSelectionEnd(newPosition);
  }, [onChange, onInteraction]);

  // Modify the handler function to not check for canImproveText
  const handleImproveSelection = async () => {
    const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
    const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;

    if (currentSelectionStart === currentSelectionEnd) return;

    const selectedText = value?.slice(currentSelectionStart, currentSelectionEnd) || "";
    if (!selectedText.trim()) return;

    setIsImproving(true);
    try {
      const result = await improveSelectedTextAction(selectedText);
      if (result.isSuccess && result.data) {
        insertTextAtCursor(result.data);
        // insertTextAtCursor already calls onChange
      }
      // Reset selection after improving
      setSelectionStart(textareaRef.current?.selectionStart || 0);
      setSelectionEnd(textareaRef.current?.selectionStart || 0);
    } catch (error) {
      console.error("Error improving text:", error);
    } finally {
      setIsImproving(false);
    }
  }; // Keep the handler function

  const hasSelection = !!textareaRef.current && textareaRef.current.selectionStart !== textareaRef.current.selectionEnd;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="taskDescArea" className="font-semibold text-lg text-foreground">Task Description:</label>
        <Button
          type="button"
          variant="secondary" size="sm"
          onClick={handleImproveSelection}
          disabled={isImproving || !hasSelection}
          className="h-7 text-xs px-2"
        >
          {isImproving ? "Improving..." : "Improve Selection"}
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
} 
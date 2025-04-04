"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useCallback, useRef } from "react";
import { improveSelectedTextAction } from "@/actions/text-improvement-actions";

interface TaskDescriptionProps {
  taskDescription: string;
  onChange: (value: string) => void;
  foundFiles: string[];
}

export default function TaskDescriptionArea({ taskDescription, onChange, foundFiles }: TaskDescriptionProps) {
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
  const insertTextAtCursor = useCallback(
    (newText: string) => {
      if (!textareaRef.current) return;

      const textarea = textareaRef.current;
      textarea.focus();
      
      // Use the browser's native clipboard commands to maintain undo history
      const originalText = textarea.value;
      textarea.setSelectionRange(selectionStart, selectionEnd);
      
      // Create an input event that can be undone
      const event = new InputEvent('input', {
        inputType: 'insertText',
        data: newText,
        bubbles: true,
        cancelable: true,
      });
      
      // Insert the text and dispatch the event
      document.execCommand('insertText', false, newText);
      textarea.dispatchEvent(event);
      
      // If execCommand failed (some browsers), fall back to direct manipulation
      if (textarea.value === originalText) {
        const before = textarea.value.slice(0, selectionStart);
        const after = textarea.value.slice(selectionEnd);
        const updated = before + newText + after;
        textarea.value = updated;
        textarea.dispatchEvent(event);
      }
      
      // Update parent state
      onChange(textarea.value);
      
      // Update cursor position
      const newPosition = selectionStart + newText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    },
    [selectionStart, selectionEnd, onChange]
  );

  const handleImproveSelection = async () => {
    if (selectionStart === selectionEnd) return;

    const selectedText = taskDescription?.slice(selectionStart, selectionEnd) || "";
    if (!selectedText.trim()) return;

    setIsImproving(true);
    try {
      const result = await improveSelectedTextAction(selectedText, foundFiles);
      if (result.isSuccess) {
        insertTextAtCursor(result.data);
      }
      // Reset selection after improving
      setSelectionStart(textareaRef.current?.selectionStart || 0);
      setSelectionEnd(textareaRef.current?.selectionStart || 0);
    } catch (error) {
      console.error("Error improving text:", error);
    } finally {
      setIsImproving(false);
    }
  };

  const hasSelection = selectionStart !== selectionEnd;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">Task Description:</label>
        <Button
          variant="secondary" size="sm"
          onClick={handleImproveSelection}
          disabled={isImproving || !hasSelection}
        >
          {isImproving ? "Improving..." : "Improve Selection"}
        </Button>
      </div>

      <textarea
        ref={textareaRef}
        id="taskDescArea"
        className="border rounded bg-background text-foreground p-2 h-32 w-full"
        value={taskDescription}
        onChange={(e) => onChange(e.target.value)}
        onSelect={handleSelect}
        placeholder="Describe what changes you want to make..."
      />
    </div>
  );
} 
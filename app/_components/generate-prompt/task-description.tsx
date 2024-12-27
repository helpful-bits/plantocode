"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface TaskDescriptionProps {
  taskDescription: string;
  onChange: (value: string) => void;
}

export default function TaskDescriptionArea({ taskDescription, onChange }: TaskDescriptionProps) {
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Capture and store the selection positions whenever the user selects text
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionStart(e.currentTarget.selectionStart);
    setSelectionEnd(e.currentTarget.selectionEnd);
  };

  // Insert or replace text at the stored cursor or selection range
  const insertTextAtCursor = useCallback(
    (newText: string) => {
      const before = taskDescription.slice(0, selectionStart);
      const after = taskDescription.slice(selectionEnd);
      const updated = before + newText + after;

      onChange(updated);

      setTimeout(() => {
        if (textareaRef.current) {
          const pos = before.length + newText.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(pos, pos);
        }
      }, 0);
    },
    [taskDescription, selectionStart, selectionEnd, onChange]
  );

  return (
    <div className="flex flex-col">
      <label className="mb-2 font-bold text-foreground">Task Description:</label>
      <textarea
        ref={textareaRef}
        id="taskDescArea"
        className="border rounded bg-background text-foreground p-2 h-32 w-full"
        value={taskDescription}
        onChange={(e) => onChange(e.target.value)}
        onSelect={handleSelect}
        placeholder="Describe what changes you want to make..."
      />
      {/* 
        You can now call insertTextAtCursor("some text") from a parent component 
        to reliably insert text at the currently selected position.
      */}
    </div>
  );
} 
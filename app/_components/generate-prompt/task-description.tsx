"use client";

import { useState, useEffect } from "react";

interface TaskDescriptionProps {
  taskDescription: string;
  onChange: (value: string) => void;
}

export default function TaskDescriptionArea({ taskDescription, onChange }: TaskDescriptionProps) {
  return (
    <div className="flex flex-col">
      <label className="mb-2 font-bold text-foreground">Task Description:</label>
      <textarea
        id="taskDescArea"
        className="border rounded bg-background text-foreground p-2 h-32 w-full"
        value={taskDescription}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe what changes you want to make..."
      />

      {/* VoiceTranscription button moved to new component */}
    </div>
  );
} 
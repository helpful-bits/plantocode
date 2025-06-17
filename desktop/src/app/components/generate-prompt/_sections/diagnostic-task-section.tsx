"use client";

import React from "react";

// Type imports only - no functional imports
import type { TaskDescriptionHandle } from "../_components/task-description";
import TaskDescriptionArea from "../_components/task-description";

interface TaskSectionProps {
  state: {
    taskDescription: string;
    isGeneratingGuidance: boolean;
    projectDirectory: string;
    taskDescriptionRef: React.RefObject<TaskDescriptionHandle>;
  };
  actions: {
    handleTaskChange: (value: string) => void;
    handleTranscribedText: (text: string) => void;
    handleInteraction: () => void;
    triggerSave: () => void;
  };
  disabled?: boolean;
}

// Diagnostic version that doesn't depend on FileManagementContext
const DiagnosticTaskSection = React.memo(function DiagnosticTaskSection({
  state,
  actions,
  disabled = false,
}: TaskSectionProps) {
  // Context is no longer needed here as we're using props instead

  // Get task description with fallbacks to ensure it's never undefined
  const { taskDescriptionRef } = state;

  // Use the task description from the state prop
  const taskDescription = state.taskDescription || "";

  const {
    handleTaskChange,
    handleInteraction,
    triggerSave,
  } = actions;

  return (
    <div className="border border-border rounded-lg p-5 bg-card shadow-sm w-full min-h-[300px]">
      <h3 className="text-lg font-medium mb-4 text-foreground">Task Description</h3>
      <TaskDescriptionArea
        ref={taskDescriptionRef}
        value={taskDescription}
        onChange={handleTaskChange}
        onInteraction={handleInteraction}
        onBlur={triggerSave}
        disabled={disabled}
      />

      <div className="flex justify-between items-start mt-4">
        <div className="text-sm text-muted-foreground">
          This is a diagnostic version with limited functionality.
          <br />
          File management has been temporarily disabled to troubleshoot
          stability issues.
        </div>
      </div>
    </div>
  );
});

DiagnosticTaskSection.displayName = "DiagnosticTaskSection";

export default DiagnosticTaskSection;

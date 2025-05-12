"use client";

import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";

const TaskDescriptionArea = React.lazy(() => import("../_components/task-description"));

interface TaskSectionProps {
  state: {
    taskDescription: string;
    isGeneratingGuidance: boolean;
    projectDirectory: string;
    taskDescriptionRef: React.RefObject<any>;
    isImprovingText?: boolean;
    textImprovementJobId?: string | null;
  };
  actions: {
    handleTaskChange: (value: string) => void;
    handleTranscribedText: (text: string) => void;
    handleInteraction: () => void;
    triggerSave: () => void;
    handleImproveSelection: (selectedText: string, selectionStart?: number, selectionEnd?: number) => Promise<void>;
  };
  disabled?: boolean;
}

// Diagnostic version that doesn't depend on FileManagementContext
const DiagnosticTaskSection = React.memo(function DiagnosticTaskSection({
  state,
  actions,
  disabled = false
}: TaskSectionProps) {
  // Get the generate prompt context for direct access to session data
  const context = useGeneratePrompt();

  // Get task description with fallbacks to ensure it's never undefined
  const {
    taskDescriptionRef
  } = state;

  // Use the task description directly from taskState via context
  const taskDescription = context.taskState.taskDescription || state.taskDescription || '';

  const {
    handleTaskChange,
    handleInteraction,
    triggerSave,
    handleImproveSelection
  } = actions;

  return (
    <div className="border rounded-lg p-5 bg-card shadow-sm w-full min-h-[300px]">
      <h3 className="text-lg font-medium mb-4">Task Description</h3>
      <Suspense fallback={
        <div className="flex justify-center items-center min-h-[240px] text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading task description editor...
        </div>
      }>
        <TaskDescriptionArea
          ref={taskDescriptionRef}
          value={taskDescription}
          onChange={handleTaskChange}
          onInteraction={handleInteraction}
          onBlur={triggerSave}
          isImproving={false}
          onImproveSelection={handleImproveSelection}
          disabled={disabled}
        />
      </Suspense>
      
      <div className="flex justify-between items-start mt-4">
        <div className="text-sm text-muted-foreground">
          This is a diagnostic version with limited functionality.
          <br />
          File management has been temporarily disabled to troubleshoot stability issues.
        </div>
      </div>
    </div>
  );
});

export default DiagnosticTaskSection;
"use client";

import React, { Suspense } from "react";
import { Sparkles, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import VoiceTranscription from "../_components/voice-transcription";
import { P, Subtle } from "@/components/ui/typography";
import { useFileManagement } from "../_contexts/file-management-context";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";

const TaskDescriptionArea = React.lazy(() => import("../_components/task-description"));

interface TaskSectionProps {
  state: {
    taskDescription: string; // Note: We'll now get this from the context directly as a fallback
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
    copyArchPrompt: (selectedPaths: string[]) => void;
    handleImproveSelection: (selectedText: string, selectionStart?: number, selectionEnd?: number) => Promise<void>;
  };
  disabled?: boolean;
}

const TaskSection = React.memo(function TaskSection({
  state,
  actions,
  disabled = false
}: TaskSectionProps) {
  // Get the generate prompt context for direct access to session data
  const context = useGeneratePrompt();

  // Since we've moved this component inside FileManagementProvider in generate-prompt-form.tsx,
  // we can now use the FileManagement context directly
  const fileState = useFileManagement();

  // Get task description with fallbacks to ensure it's never undefined
  const {
    isGeneratingGuidance,
    projectDirectory,
    taskDescriptionRef,
    isImprovingText,
    textImprovementJobId
  } = state;

  // Use the task description directly from taskState via context,
  // or fall back to props or empty string
  const taskDescription = context.taskState.taskDescription || state.taskDescription || '';

  // Get file paths from FileManagement context
  const { includedPaths } = fileState;

  const {
    handleTaskChange,
    handleTranscribedText,
    handleInteraction,
    triggerSave,
    copyArchPrompt,
    handleImproveSelection
  } = actions;

  return (
    <div className="border rounded-lg p-5 bg-card shadow-sm w-full min-h-[300px]">
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
          isImproving={isImprovingText || false}
          onImproveSelection={handleImproveSelection}
          disabled={disabled}
        />
      </Suspense>
      
      <div className="flex justify-between items-start mt-4">
        <div className="flex items-start gap-4">
          <div className="flex flex-col">
            <Button
              type="button"
              variant={!taskDescription.trim() ? "destructive" : "secondary"}
              size="sm"
              onClick={() => copyArchPrompt(includedPaths)}
              disabled={!taskDescription.trim() || disabled}
              isLoading={isGeneratingGuidance}
              loadingText="Generating Guidance..."
              title={!taskDescription.trim() ? "Enter a task description first" :
                     isGeneratingGuidance ? "Generating guidance..." :
                     includedPaths.length === 0 ? "No files selected - guidance may be limited" :
                     `Analyze ${includedPaths.length} selected files to generate architectural guidance`}
              className="h-9"
            >
              {!taskDescription.trim() ? (
                <>Task Description Required</>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get Architectural Guidance
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-1 text-balance">
              {!taskDescription.trim() ? (
                <span className="text-red-600 dark:text-red-400">Please enter a task description above to enable this feature.</span>
              ) : (
                "Analyzes task description and selected files (if any) to provide high-level implementation guidance."
              )}
            </p>
          </div>
        </div>

        <div className="ml-4">
          <VoiceTranscription
            onTranscribed={handleTranscribedText}
            onInteraction={handleInteraction}
            textareaRef={taskDescriptionRef}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
});

export default TaskSection;
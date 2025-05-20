"use client";

import { Sparkles, Loader2 } from "lucide-react";
import React, { Suspense } from "react";

import { Button } from "@/ui/button";

import VoiceTranscription from "../_components/voice-transcription";
import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import { useTaskContext } from "../_contexts/task-context";

const TaskDescriptionArea = React.lazy(
  () => import("../_components/task-description")
);

interface TaskSectionProps {
  disabled?: boolean;
}

const TaskSection = React.memo(function TaskSection({
  disabled = false,
}: TaskSectionProps) {
  // Get the task context for direct access to task data
  const { state: taskState, actions: taskActions } = useTaskContext();
  const { actions: coreActions } = useCorePromptContext();

  // Use the FileManagement context directly
  const fileState = useFileManagement();

  const {
    taskDescription,
    taskDescriptionRef,
    isGeneratingGuidance,
    isImprovingText,
    // This is properly marked as unused
    textImprovementJobId: _textImprovementJobId,
  } = taskState;

  const { setTaskDescription, handleGenerateGuidance, handleImproveSelection } =
    taskActions;

  // Get file paths from FileManagement context
  const { includedPaths } = fileState;

  // Handler for transcribed text from voice input
  const handleTranscribedText = (text: string) => {
    setTaskDescription(text);
  };

  return (
    <div className="border rounded-lg p-5 bg-card shadow-sm w-full min-h-[300px]">
      <Suspense
        fallback={
          <div className="flex justify-center items-center min-h-[240px] text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading task description editor...
          </div>
        }
      >
        <TaskDescriptionArea
          ref={taskDescriptionRef}
          value={taskDescription}
          onChange={setTaskDescription}
          onInteraction={coreActions.handleInteraction}
          onBlur={coreActions.flushPendingSaves}
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
              onClick={() => handleGenerateGuidance(includedPaths)}
              disabled={!taskDescription.trim() || disabled}
              isLoading={isGeneratingGuidance}
              loadingText="Generating Guidance..."
              title={
                !taskDescription.trim()
                  ? "Enter a task description first"
                  : isGeneratingGuidance
                    ? "Generating guidance..."
                    : includedPaths.length === 0
                      ? "No files selected - guidance may be limited"
                      : `Analyze ${includedPaths.length} selected files to generate architectural guidance`
              }
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
                <span className="text-red-600 dark:text-red-400">
                  Please enter a task description above to enable this feature.
                </span>
              ) : (
                "Analyzes task description and selected files (if any) to provide high-level implementation guidance."
              )}
            </p>
          </div>
        </div>

        <div className="ml-4">
          <VoiceTranscription
            onTranscribed={handleTranscribedText}
            onInteraction={coreActions.handleInteraction}
            textareaRef={taskDescriptionRef || undefined}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
});

export default TaskSection;
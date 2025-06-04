"use client";

import { Sparkles } from "lucide-react";
import React, { useCallback } from "react";

import { Button } from "@/ui/button";

import VoiceTranscription from "../_components/voice-transcription";
import TaskDescriptionArea from "../_components/task-description";
import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useTaskContext } from "../_contexts/task-context";
import { 
  useSessionStateContext, 
  useSessionActionsContext 
} from "@/contexts/session";

interface TaskSectionProps {
  disabled?: boolean;
}

const TaskSection = React.memo(function TaskSection({
  disabled = false,
}: TaskSectionProps) {
  // Get task description from SessionContext
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();
  
  
  // Get the task context for UI state and actions
  const { state: taskState, actions: taskActions } = useTaskContext();
  const { actions: coreActions } = useCorePromptContext();

  const {
    taskDescriptionRef,
    isGeneratingGuidance,
    isImprovingText,
  } = taskState;

  const { handleGenerateGuidance, handleImproveSelection } = taskActions;
  
  // Streamlined task change handler
  const handleTaskChange = useCallback((value: string) => {
    sessionActions.updateCurrentSessionFields({ taskDescription: value });
    coreActions.handleInteraction();
  }, [sessionActions, coreActions]);

  // Get included files count from session
  const includedFilesCount = (sessionState.currentSession?.includedFiles || []).length;

  // Handler for transcribed text from voice input
  const handleTranscribedText = (text: string) => {
    handleTaskChange(text);
  };

  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card shadow-sm w-full min-h-[300px]">
      <TaskDescriptionArea
        ref={taskDescriptionRef}
        value={sessionState.currentSession?.taskDescription || ""}
        onChange={handleTaskChange}
        onInteraction={coreActions.handleInteraction}
        onBlur={sessionActions.flushSaves}
        isImproving={isImprovingText || false}
        onImproveSelection={handleImproveSelection}
        disabled={disabled}
      />

      <div className="flex justify-between items-start mt-4">
        <div className="flex items-start gap-4">
          <div className="flex flex-col">
            <Button
              type="button"
              variant={!(sessionState.currentSession?.taskDescription || "").trim() ? "destructive" : "secondary"}
              size="sm"
              onClick={() => handleGenerateGuidance()}
              disabled={!(sessionState.currentSession?.taskDescription || "").trim() || disabled}
              isLoading={isGeneratingGuidance}
              loadingText="Generating Guidance..."
              title={
                !(sessionState.currentSession?.taskDescription || "").trim()
                  ? "Enter a task description first"
                  : isGeneratingGuidance
                    ? "Generating guidance..."
                    : includedFilesCount === 0
                      ? "No files selected - guidance may be limited"
                      : `Analyze ${includedFilesCount} selected files to generate architectural guidance`
              }
              className="h-9"
            >
              {!(sessionState.currentSession?.taskDescription || "").trim() ? (
                <>Task Description Required</>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Get Architectural Guidance
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-1 text-balance">
              {!(sessionState.currentSession?.taskDescription || "").trim() ? (
                <span className="text-destructive">
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

TaskSection.displayName = "TaskSection";

export default TaskSection;
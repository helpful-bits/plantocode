"use client";

import React, { useCallback } from "react";
import { Sparkles } from "lucide-react";

import VoiceTranscription from "../_components/voice-transcription";
import TaskDescriptionArea from "../_components/task-description";
import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useTaskContext } from "../_contexts/task-context";
import { 
  useSessionStateContext, 
  useSessionActionsContext 
} from "@/contexts/session";
import { Button } from "@/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";

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
    isRefiningTask,
    canUndo,
    canRedo,
    tokenEstimate,
  } = taskState;

  const { 
    // New actions for task refinement and undo/redo
    handleRefineTask,
    undo,
    redo,
  } = taskActions;
  
  // Optimized session update - only update session state, no redundant processing
  const handleTaskChange = useCallback((value: string) => {
    // Update session state and mark as modified for persistence
    sessionActions.updateCurrentSessionFields({ taskDescription: value });
    sessionActions.setSessionModified(true);
    
    // Single interaction notification without additional debouncing
    coreActions.handleInteraction();
  }, [sessionActions, coreActions]);


  // Handler for transcribed text from voice input
  const handleTranscribedText = (text: string) => {
    handleTaskChange(text);
  };

  // Calculate if refine task should be shown based on estimated tokens
  const shouldShowRefineTask = (tokenEstimate?.totalTokens ?? 0) > 100000;

  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card shadow-sm w-full min-h-[300px]">
      <TaskDescriptionArea
        ref={taskDescriptionRef}
        value={sessionState.currentSession?.taskDescription || ""}
        onChange={handleTaskChange}
        onInteraction={coreActions.handleInteraction}
        onBlur={sessionActions.flushSaves}
        disabled={disabled}
        // New props for undo/redo
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />

      {/* Refine Task button - only shown when tokens exceed 30,000 */}
      {shouldShowRefineTask && (
        <div className="mt-4">
          <Button
            variant="default"
            size="sm"
            onClick={handleRefineTask}
            disabled={disabled}
            isLoading={isRefiningTask}
            loadingText="AI is refining..."
            className="w-full"
          >
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Refine Task with AI
            </>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                <span className="underline decoration-dashed cursor-help">
                  The estimated prompt size (task + files) is large ({tokenEstimate?.totalTokens?.toLocaleString()} tokens). AI can help refine it for better results.
                </span>
              </p>
            </TooltipTrigger>
            {tokenEstimate && (
              <TooltipContent>
                <div>
                  System Prompt (files, etc.): {tokenEstimate.systemPromptTokens.toLocaleString()} tokens<br />
                  User Prompt (task): {tokenEstimate.userPromptTokens.toLocaleString()} tokens
                </div>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      )}

      <div className="flex justify-end items-start mt-2">
        <VoiceTranscription
          onTranscribed={handleTranscribedText}
          onInteraction={coreActions.handleInteraction}
          textareaRef={taskDescriptionRef || undefined}
          disabled={disabled}
        />
      </div>
    </div>
  );
});

TaskSection.displayName = "TaskSection";

export default TaskSection;
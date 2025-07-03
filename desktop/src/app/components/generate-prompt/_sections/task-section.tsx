"use client";

import React, { useCallback } from "react";
import { Sparkles } from "lucide-react";

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
    isDoingWebSearch,
    canUndo,
    canRedo,
    tokenEstimate,
  } = taskState;

  const { 
    // New actions for task refinement and undo/redo
    handleRefineTask,
    handleWebSearch,
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


  // Calculate if refine task should be shown based on estimated tokens
  const shouldShowRefineTask = (tokenEstimate?.totalTokens ?? 0) > 100000;

  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card shadow-sm w-full">
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

      {/* Web Search Enhancement - always available */}
      <div className="mt-4">
        <Button
          onClick={handleWebSearch}
          isLoading={isDoingWebSearch}
          disabled={disabled || isRefiningTask || isDoingWebSearch || !sessionState.currentSession?.taskDescription?.trim()}
          variant="secondary"
          size="sm"
          className="w-full"
        >
          Enhance with Web Search
        </Button>
      </div>

      {/* AI Refine Task button - only shown when tokens exceed 100,000 */}
      {shouldShowRefineTask && (
        <div className="mt-2 space-y-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleRefineTask}
            disabled={disabled || isDoingWebSearch}
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
              <p className="text-xs text-muted-foreground text-center">
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

    </div>
  );
});

TaskSection.displayName = "TaskSection";

export default TaskSection;
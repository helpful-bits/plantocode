"use client";

import React, { useCallback, useState } from "react";
import { Sparkles, X, Search, HelpCircle } from "lucide-react";

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
  // State for controlling tooltip visibility
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);
  const [showRefineHelpTooltip, setShowRefineHelpTooltip] = useState(false);
  
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
    cancelWebSearch,
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
      <div className="mt-4 flex gap-2">
        <Button
          onClick={handleWebSearch}
          isLoading={isDoingWebSearch}
          disabled={disabled || isRefiningTask || isDoingWebSearch || !sessionState.currentSession?.taskDescription?.trim()}
          variant="secondary"
          size="sm"
          className="flex-1"
        >
          <>
            <Search className="h-4 w-4 mr-2" />
            Deep Research
            <span className="text-xs ml-1 opacity-70">(can be expensive)</span>
          </>
        </Button>
        
        <Tooltip open={showHelpTooltip} onOpenChange={setShowHelpTooltip}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="px-2"
              disabled={disabled}
              onClick={() => setShowHelpTooltip(!showHelpTooltip)}
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="max-w-xs space-y-2">
              <p>
                Enhances your task description with relevant information from the web, including latest documentation, best practices, and implementation examples
              </p>
              <p className="text-xs font-medium border-t border-primary-foreground/20 pt-2">
                High token usage - but results are often worth it!
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
        
        {/* Cancel button - only shown when web search is running */}
        {isDoingWebSearch && (
          <Button
            onClick={cancelWebSearch}
            disabled={disabled}
            variant="outline"
            size="sm"
            className="px-3"
            aria-label="Cancel web search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* AI Refine Task button - only shown when tokens exceed 100,000 */}
      {shouldShowRefineTask && (
        <div className="mt-2 flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefineTask}
            disabled={disabled || isDoingWebSearch}
            isLoading={isRefiningTask}
            loadingText="AI is refining..."
            className="flex-1"
          >
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Refine Task
            </>
          </Button>
          
          <Tooltip open={showRefineHelpTooltip} onOpenChange={setShowRefineHelpTooltip}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                disabled={disabled}
                onClick={() => setShowRefineHelpTooltip(!showRefineHelpTooltip)}
              >
                <HelpCircle className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="max-w-xs space-y-2">
                <p>
                  AI will analyze and optimize your task description to improve clarity and results when working with large contexts
                </p>
                {tokenEstimate && (
                  <div className="text-xs border-t border-primary-foreground/20 pt-2">
                    <p className="font-medium mb-1">Current token usage ({tokenEstimate.totalTokens.toLocaleString()} total):</p>
                    <div className="space-y-0.5 opacity-90">
                      <p>• Files & context: {tokenEstimate.systemPromptTokens.toLocaleString()} tokens</p>
                      <p>• Task description: {tokenEstimate.userPromptTokens.toLocaleString()} tokens</p>
                    </div>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      )}

    </div>
  );
});

TaskSection.displayName = "TaskSection";

export default TaskSection;
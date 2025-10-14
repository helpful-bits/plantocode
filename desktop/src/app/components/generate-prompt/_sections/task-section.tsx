"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { X, Search, HelpCircle } from "lucide-react";

import TaskDescriptionArea from "../_components/task-description";
import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useTaskContext } from "../_contexts/task-context";
import {
  useSessionStateContext,
  useSessionActionsContext
} from "@/contexts/session";
import { Button } from "@/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { usePlausible } from "@/hooks/use-plausible";

/**
 * External Update Gate Implementation (Cursor Stability)
 *
 * This component implements a two-layer defense against cursor jumps and input lag:
 * 1. External updates to session.taskDescription are deferred while the textarea is focused
 *    or user is actively typing (200ms idle threshold)
 * 2. Queued updates are flushed on blur or when typing becomes idle, with selection preserved
 *
 * This prevents race conditions where background processes (session sync, web search, video analysis,
 * text improvement) would overwrite user input and cause the cursor to jump during active typing.
 *
 * Key mechanisms:
 * - Local state (localTaskDescription) provides immediate UI updates without backend latency
 * - Parent-level gating queues remote updates in pendingRemoteValueRef while user types
 * - Child component (TaskDescriptionArea) handles fine-grained caret preservation via refs and rAF
 * - Backend sync remains debounced at 300ms to avoid hot-path overhead
 */

interface TaskSectionProps {
  disabled?: boolean;
}

const TaskSection = React.memo(function TaskSection({
  disabled = false,
}: TaskSectionProps) {
  const { trackEvent } = usePlausible();

  // State for controlling tooltip visibility
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);

  // Get task description from SessionContext
  const sessionState = useSessionStateContext();
  const sessionActions = useSessionActionsContext();

  // Local state for immediate UI updates (prevents lag)
  const [localTaskDescription, setLocalTaskDescription] = useState(
    sessionState.currentSession?.taskDescription || ""
  );

  // External Update Gate: defers session/background taskDescription updates while user is focused or actively typing
  const sessionTaskDescription = sessionState.currentSession?.taskDescription || "";
  const currentSessionId = sessionState.currentSession?.id || null;

  useEffect(() => {
    // Handle session switch - always apply immediately and clear pending
    if (currentSessionId !== lastSessionIdRef.current) {
      lastSessionIdRef.current = currentSessionId;
      setLocalTaskDescription(sessionTaskDescription);
      pendingRemoteValueRef.current = null;
      return;
    }

    // No change - skip
    if (sessionTaskDescription === localTaskDescription) {
      return;
    }

    // Get focus and typing state from child component
    const handle = taskDescriptionRef.current;
    const focused = Boolean(handle?.isFocused) || (document.activeElement && (document.activeElement as any).id === "taskDescArea");
    const typing = isUserTypingRef.current || Boolean(handle?.isTyping);

    // Gate: defer update if focused or typing
    if (focused || typing) {
      pendingRemoteValueRef.current = sessionTaskDescription;
      return;
    }

    // Apply immediately if not focused and not typing
    setLocalTaskDescription(sessionTaskDescription);
    pendingRemoteValueRef.current = null;
  }, [sessionTaskDescription, currentSessionId, localTaskDescription]);

  // Flush pending remote updates when typing becomes idle
  useEffect(() => {
    if (!isUserTypingRef.current && pendingRemoteValueRef.current !== null && pendingRemoteValueRef.current !== localTaskDescription) {
      const handle = taskDescriptionRef.current;
      const focused = Boolean(handle?.isFocused);

      if (focused && handle?.setValue) {
        // Use handle.setValue to preserve selection
        handle.setValue(pendingRemoteValueRef.current, true);
      } else {
        setLocalTaskDescription(pendingRemoteValueRef.current);
      }
      pendingRemoteValueRef.current = null;
    }
  }, [localTaskDescription]); // Re-check when local changes

  // Debounce timer ref
  const debounceTimerRef = useRef<number | null>(null);

  // External update gate refs for cursor stability
  const isUserTypingRef = useRef(false);
  const typingIdleTimerRef = useRef<number | null>(null);
  const pendingRemoteValueRef = useRef<string | null>(null);
  const lastSessionIdRef = useRef<string | null>(null);

  // Get the task context for UI state and actions
  const { state: taskState, actions: taskActions } = useTaskContext();
  const { actions: coreActions } = useCorePromptContext();

  const {
    taskDescriptionRef,
    isDoingWebSearch,
    canUndo,
    canRedo,
  } = taskState;

  const {
    // New actions for task refinement and undo/redo
    handleWebSearch,
    cancelWebSearch,
    undo,
    redo,
  } = taskActions;

  // Optimized session update with debouncing - prevents lag and cursor jumping
  const handleTaskChange = useCallback((value: string) => {
    // Update local state immediately for responsive UI
    setLocalTaskDescription(value);

    // Mark user as actively typing
    isUserTypingRef.current = true;
    if (typingIdleTimerRef.current) {
      clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      isUserTypingRef.current = false;
      typingIdleTimerRef.current = null;
    }, 200); // 200ms idle threshold to match component

    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the expensive session state updates and backend sync
    debounceTimerRef.current = window.setTimeout(async () => {
      // Update session state and mark as modified for persistence
      sessionActions.updateCurrentSessionFields({ taskDescription: value });
      sessionActions.setSessionModified(true);

      // Single interaction notification
      coreActions.handleInteraction();

      // Call backend to emit relay events for mobile sync
      if (sessionState.currentSession?.id) {
        const { updateSessionFieldsAction } = await import("@/actions");
        try {
          await updateSessionFieldsAction(sessionState.currentSession.id, {
            taskDescription: value,
          });
        } catch (error) {
          console.error("Failed to sync task description to backend:", error);
        }
      }
    }, 300); // 300ms debounce - balances responsiveness with performance
  }, [sessionActions, coreActions, sessionState.currentSession?.id]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (typingIdleTimerRef.current) {
        clearTimeout(typingIdleTimerRef.current);
      }
    };
  }, []);

  // Handle blur - flush pending changes immediately
  const handleBlur = useCallback(async () => {
    // Flush any pending remote updates on blur
    if (pendingRemoteValueRef.current !== null) {
      const handle = taskDescriptionRef.current;
      if (handle?.setValue) {
        handle.setValue(pendingRemoteValueRef.current, true);
      }
      pendingRemoteValueRef.current = null;
    }

    // Cancel debounce timer and apply changes immediately
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Apply any pending changes to session
    if (localTaskDescription !== sessionState.currentSession?.taskDescription) {
      sessionActions.updateCurrentSessionFields({ taskDescription: localTaskDescription });
      sessionActions.setSessionModified(true);

      // Sync to backend
      if (sessionState.currentSession?.id) {
        const { updateSessionFieldsAction } = await import("@/actions");
        try {
          await updateSessionFieldsAction(sessionState.currentSession.id, {
            taskDescription: localTaskDescription,
          });
        } catch (error) {
          console.error("Failed to sync task description to backend:", error);
        }
      }
    }

    // Then flush saves to disk
    await sessionActions.flushSaves();
  }, [localTaskDescription, sessionState.currentSession?.taskDescription, sessionState.currentSession?.id, sessionActions]);

  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card shadow-sm w-full">
      <TaskDescriptionArea
        ref={taskDescriptionRef}
        value={localTaskDescription}
        onChange={handleTaskChange}
        onInteraction={coreActions.handleInteraction}
        onBlur={handleBlur}
        disabled={disabled}
        // New props for undo/redo
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
      />

      {/* Web Search Enhancement - always available */}
      <div className="mt-4 flex items-center gap-6">
        {/* Group 1: Deep Research button with its question mark */}
        <div className="flex items-center gap-1 flex-1">
          <Button
            onClick={() => {
              trackEvent('desktop_deep_research_started', {
                task_length: sessionState.currentSession?.taskDescription?.length || 0,
                location: 'task_section'
              });
              handleWebSearch(false);
            }}
            isLoading={isDoingWebSearch}
            disabled={disabled || isDoingWebSearch || !sessionState.currentSession?.taskDescription?.trim()}
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
        </div>
        
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

    </div>
  );
});

TaskSection.displayName = "TaskSection";

export default TaskSection;
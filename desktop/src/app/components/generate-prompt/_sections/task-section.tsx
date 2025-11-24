"use client";

import React, { useState } from "react";
import { X, Search, HelpCircle, Terminal } from "lucide-react";

import TaskDescriptionArea from "../_components/task-description";
import { useTaskContext } from "../_contexts/task-context";
import {
  useSessionStateContext,
} from "@/contexts/session";
import { Button } from "@/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { usePlausible } from "@/hooks/use-plausible";
import { useTerminalSessions } from "@/contexts/terminal-sessions";

interface TaskSectionProps {
  disabled?: boolean;
}

const TaskSection = React.memo(function TaskSection({
  disabled = false,
}: TaskSectionProps) {
  const { trackEvent } = usePlausible();
  const [showHelpTooltip, setShowHelpTooltip] = useState(false);

  const sessionState = useSessionStateContext();
  const { startSession, getSession } = useTerminalSessions();

  const { state: taskState, actions: taskActions } = useTaskContext();

  const {
    taskDescriptionRef,
    isDoingWebSearch,
    canUndo,
    canRedo,
  } = taskState;

  const {
    handleWebSearch,
    cancelWebSearch,
    undo,
    redo,
  } = taskActions;

  // Re-check button state at click time in case remote update just disabled it
  const handleUndoClick = () => {
    if (!canUndo) {
      console.warn('Undo disabled by remote update');
      return;
    }
    undo();
  };

  const handleRedoClick = () => {
    if (!canRedo) {
      console.warn('Redo disabled by remote update');
      return;
    }
    redo();
  };

  if (!sessionState.currentSession?.id) {
    return null;
  }

  const handleStartTerminalSession = async () => {
    if (!sessionState.currentSession) {
      return;
    }

    const projectDirectory = sessionState.currentSession.projectDirectory;
    const currentTaskDescription = sessionState.currentSession.taskDescription || "";

    if (!projectDirectory) {
      return;
    }

    const baseId = `task:${sessionState.currentSession.id}`;
    const existing = getSession(baseId);

    if (existing && !['completed', 'failed', 'exited'].includes(existing.status)) {
      // Prompt: Resume existing or start new?
      const shouldResume = confirm('An existing terminal session is active for this task. Resume it? (Cancel to start a new session)');

      if (shouldResume) {
        window.dispatchEvent(new CustomEvent('open-terminal-session', {
          detail: { sessionId: baseId }
        }));
        return;
      } else {
        const newId = `${baseId}:${Date.now()}`;
        const taskTitleOrSnippet = currentTaskDescription.split('\n')[0].slice(0, 50) || 'Task';
        await startSession(newId, {
          workingDirectory: projectDirectory,
          displayName: `Task — ${taskTitleOrSnippet}`,
          origin: 'task',
          jobId: newId,
          initialInput: currentTaskDescription,
        });
        window.dispatchEvent(new CustomEvent('open-terminal-session', {
          detail: { sessionId: newId }
        }));
        return;
      }
    }

    const taskTitleOrSnippet = currentTaskDescription.split('\n')[0].slice(0, 50) || 'Task';
    await startSession(baseId, {
      workingDirectory: projectDirectory,
      displayName: `Task — ${taskTitleOrSnippet}`,
      origin: 'task',
      jobId: baseId,
      initialInput: currentTaskDescription,
    });
    window.dispatchEvent(new CustomEvent('open-terminal-session', {
      detail: { sessionId: baseId }
    }));
  };

  return (
    <div className="border border-border/60 rounded-lg p-5 bg-card shadow-sm w-full">
      <TaskDescriptionArea
        key={sessionState.currentSession.id}
        ref={taskDescriptionRef}
        sessionId={sessionState.currentSession.id}
        initialValue={sessionState.currentSession.taskDescription || ""}
        disabled={disabled}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndoClick}
        onRedo={handleRedoClick}
      />

      <div className="mt-4 flex items-center gap-2">
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleStartTerminalSession}
              disabled={disabled}
              variant="outline"
              size="sm"
              className="px-3"
              aria-label="Start Terminal Session"
            >
              <Terminal className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Start Terminal Session</p>
          </TooltipContent>
        </Tooltip>

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

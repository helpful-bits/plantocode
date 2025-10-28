"use client";

import { Undo2, Redo2 } from "lucide-react";
import React, {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import type { ChangeEvent } from "react";

import { useScreenRecording } from "@/contexts/screen-recording";
import { useSessionActionsContext } from "@/contexts/session";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils/utils";
import VoiceTranscription from "./voice-transcription";
import { VideoRecordingDialog } from "./video-recording-dialog";
import { useTaskContext } from "../_contexts/task-context";
import { queueTaskDescriptionUpdate, startTaskEdit, endTaskEdit, createDebouncer } from "@/actions/session/task-fields.actions";
import { useTextareaResize } from "@/hooks/use-textarea-resize";

export interface TaskDescriptionHandle {
  insertTextAtCursorPosition: (text: string) => void;
  appendText: (text: string) => void;
  replaceSelection: (newText: string) => void;
  replaceText: (oldText: string, newText: string) => void;
  flushPendingChanges: () => string;
  setValue: (value: string, opts?: { silent?: boolean }) => void;
  setValueFromHistory: (value: string) => void;
  getValue: () => string;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  focus: () => void;
  readonly isFocused: boolean;
  readonly isTyping: boolean;
}

interface TaskDescriptionProps {
  sessionId: string;
  initialValue: string;
  disabled?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onFocusExtra?: () => void;
  onBlurExtra?: () => void;
}

const TaskDescriptionArea = forwardRef<TaskDescriptionHandle, TaskDescriptionProps>(
  function TaskDescriptionArea(
    {
      sessionId,
      initialValue,
      disabled = false,
      canUndo = false,
      canRedo = false,
      onUndo,
      onRedo,
      onFocusExtra,
      onBlurExtra,
    }: TaskDescriptionProps,
    ref: React.ForwardedRef<TaskDescriptionHandle>
  ) {
    const { state: taskState, actions: taskActions } = useTaskContext();
    const { recordTaskChange } = taskActions;
    const { isAnalyzingVideo, historyReady } = taskState;
    const sessionActions = useSessionActionsContext();

    // Controlled component - parent passes value via initialValue, we maintain local state for performance
    // Component resets when sessionId changes (via key prop in parent)
    const [localValue, setLocalValue] = useState(initialValue);
    const valueRef = useRef(initialValue);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const suppressNextDebounceRef = useRef(false);

    // ✅ Calculate during rendering - no state needed
    const isEmpty = !localValue?.trim();

    const { isRecording, stopRecording } = useScreenRecording();
    const [showVideoDialog, setShowVideoDialog] = useState(false);

    const isFocusedRef = React.useRef(false);
    const isUserTypingRef = React.useRef(false);
    const typingIdleTimerRef = React.useRef<number | null>(null);
    const heartbeatIntervalRef = React.useRef<number | null>(null);
    const lastQueuedRef = useRef<string | null>(null);
    const wasPasteRef = useRef(false);
    const historyChangeDebounceRef = useRef<number | null>(null);

    // Create a stable debounced update function (200ms matches backend's 150ms batch + margin)
    const debouncedQueueUpdate = React.useMemo(
      () => createDebouncer((sid: string, value: string) => {
        queueTaskDescriptionUpdate(sid, value).catch((error) => {
          console.error("Failed to queue task description update:", error);
        });
      }, 200),
      []
    );

    // Immediate flush function for blur events
    const flushPendingUpdate = React.useCallback((value: string) => {
      // Cancel any pending debounced call and execute immediately
      return queueTaskDescriptionUpdate(sessionId, value).catch(() => {});
    }, [sessionId]);

    const handleValueChange = React.useCallback((newValue: string) => {
      if (suppressNextDebounceRef.current) {
        suppressNextDebounceRef.current = false;
        valueRef.current = newValue;
        setLocalValue(newValue);
        // DO NOT call debouncedQueueUpdate or mutate lastQueuedRef here
        return;
      }
      // Update ref immediately
      valueRef.current = newValue;
      // Update state for controlled component
      setLocalValue(newValue);

      // Deduplicate: Skip IPC if we already queued this exact value
      if (newValue === lastQueuedRef.current) {
        return;
      }
      lastQueuedRef.current = newValue;
      // Debounce the IPC call to reduce overhead
      debouncedQueueUpdate(sessionId, newValue);
    }, [sessionId, debouncedQueueUpdate]);

    const TYPING_IDLE_MS = 200;
    const handleKeyActivity = () => {
      isUserTypingRef.current = true;
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = window.setTimeout(() => {
        isUserTypingRef.current = false;
        typingIdleTimerRef.current = null;
      }, TYPING_IDLE_MS);
    };

    const handleFocus = () => {
      isFocusedRef.current = true;
      (window as any).__taskDescriptionEditorFocused = true;
      startTaskEdit(sessionId).catch(() => {});
      onFocusExtra?.();

      heartbeatIntervalRef.current = window.setInterval(() => {
        startTaskEdit(sessionId).catch(() => {});
      }, 3000);
    };

    const handleBlur = async () => {
      isFocusedRef.current = false;
      (window as any).__taskDescriptionEditorFocused = false;

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      // Flush any pending debounced updates immediately
      const currentValue = valueRef.current;
      await flushPendingUpdate(currentValue);

      sessionActions.updateCurrentSessionFields({ taskDescription: valueRef.current });
      await endTaskEdit(sessionId).catch(() => {});

      onBlurExtra?.();
    };

    useImperativeHandle(ref, () => ({
      insertTextAtCursorPosition: (text: string) => {
        const textarea = internalTextareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? 0;
        const next = valueRef.current.slice(0, start) + text + valueRef.current.slice(end);
        handleValueChange(next);
        setTimeout(() => {
          textarea.setSelectionRange(start + text.length, start + text.length);
        }, 0);
      },
      appendText: (text: string) => {
        const next = `${valueRef.current}\n\n${text}`;
        handleValueChange(next);
        if (!isFocusedRef.current) {
          setTimeout(() => {
            const el = internalTextareaRef.current;
            if (el) {
              el.focus();
              const end = next.length;
              el.setSelectionRange(end, end);
            }
          }, 0);
        }
      },
      replaceSelection: (newText: string) => {
        const el = internalTextareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const next = valueRef.current.slice(0, start) + newText + valueRef.current.slice(end);
        handleValueChange(next);
        setTimeout(() => {
          el.setSelectionRange(start + newText.length, start + newText.length);
        }, 0);
      },
      replaceText: (oldText: string, newText: string) => {
        const next = valueRef.current.replace(oldText, newText);
        if (next !== valueRef.current) {
          handleValueChange(next);
        }
      },
      setValue: (value: string, opts?: { silent?: boolean }) => {
        if (opts?.silent) suppressNextDebounceRef.current = true;
        handleValueChange(value);
      },
      setValueFromHistory: (value: string) => {
        suppressNextDebounceRef.current = true;
        handleValueChange(value);
      },
      getValue: () => valueRef.current,
      flushPendingChanges: () => valueRef.current,
      get value() { return valueRef.current; },
      get selectionStart() { return internalTextareaRef.current?.selectionStart ?? 0; },
      get selectionEnd() { return internalTextareaRef.current?.selectionEnd ?? 0; },
      focus: () => internalTextareaRef.current?.focus(),
      get isFocused() { return isFocusedRef.current; },
      get isTyping() { return isUserTypingRef.current; },
    }), [handleValueChange, sessionId]);

    // Use shared resize hook
    useTextareaResize(internalTextareaRef, valueRef.current, { minHeight: 200, maxHeight: 600, extraHeight: 50 });

    // Cleanup history debounce on unmount
    useEffect(() => {
      return () => {
        if (historyChangeDebounceRef.current) {
          clearTimeout(historyChangeDebounceRef.current);
          historyChangeDebounceRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      const handleExternalChange = (event: Event) => {
        const customEvent = event as CustomEvent;
        const { sessionId: eventSessionId, value } = customEvent.detail || {};

        if (eventSessionId === sessionId && value !== undefined) {
          valueRef.current = value;
          setLocalValue(value);
        }
      };

      window.addEventListener('task-description-local-change', handleExternalChange);
      return () => {
        window.removeEventListener('task-description-local-change', handleExternalChange);
      };
    }, [sessionId]);

    const handlePaste = useCallback(() => {
      wasPasteRef.current = true;
    }, []);

    const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;

      // ✅ Update state directly in event handler
      valueRef.current = newValue;
      setLocalValue(newValue);

      // Queue IPC update (debounced)
      debouncedQueueUpdate(sessionId, newValue);

      // History tracking with debounce for typing, immediate for paste
      if (historyChangeDebounceRef.current) {
        clearTimeout(historyChangeDebounceRef.current);
      }

      const scheduleRecord = () => {
        if (recordTaskChange) {
          recordTaskChange(wasPasteRef.current ? 'paste' : 'typing', newValue);
        }
      };

      if (wasPasteRef.current) {
        wasPasteRef.current = false;
        scheduleRecord(); // Immediate for paste
      } else {
        historyChangeDebounceRef.current = window.setTimeout(scheduleRecord, 1000); // 1s debounce for typing
      }
    }, [sessionId, debouncedQueueUpdate, recordTaskChange]);

    return (
      <>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label
                htmlFor="taskDescArea"
                className="font-semibold text-lg text-foreground"
              >
                Task Description
              </label>
              <span
                className={cn(
                  "text-xs bg-destructive/10 backdrop-blur-sm text-destructive px-2 py-0.5 rounded-md border border-destructive/20",
                  !isEmpty && "invisible"
                )}
              >
                Required
              </span>
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onUndo}
                  disabled={!historyReady || !canUndo || disabled}
                  title="Undo last change"
                  className="h-6 w-6"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onRedo}
                  disabled={!historyReady || !canRedo || disabled}
                  title="Redo undone change"
                  className="h-6 w-6"
                >
                  <Redo2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <VoiceTranscription
                onTranscribed={(text) => {
                  const el = internalTextareaRef.current;
                  if (!el) return;
                  const start = el.selectionStart ?? 0;
                  const end = el.selectionEnd ?? 0;
                  const currentValue = valueRef.current;
                  const beforeCursor = currentValue.slice(0, start);
                  const afterCursor = currentValue.slice(end);
                  const needsSpaceBefore = beforeCursor.length > 0 &&
                    !beforeCursor.endsWith(' ') &&
                    !beforeCursor.endsWith('\n');
                  const prefix = needsSpaceBefore ? ' ' : '';
                  const trimmedText = text.trim();
                  const newValue = beforeCursor + prefix + trimmedText + afterCursor;

                  // ✅ Update state directly - let React handle the DOM
                  valueRef.current = newValue;
                  setLocalValue(newValue);
                  debouncedQueueUpdate(sessionId, newValue);

                  // Record voice input in history
                  if (recordTaskChange) {
                    recordTaskChange('voice', newValue);
                  }
                  sessionActions.updateCurrentSessionFields({ taskDescription: newValue });

                  // Set cursor position after state updates
                  setTimeout(() => {
                    const newCursorPos = beforeCursor.length + prefix.length + trimmedText.length;
                    el.setSelectionRange(newCursorPos, newCursorPos);
                  }, 0);
                }}
                disabled={disabled}
              />

              {!isRecording ? (
                <Button
                  onClick={() => {
                    if (!isRecording && !isAnalyzingVideo) {
                      setShowVideoDialog(true);
                    }
                  }}
                  disabled={disabled || isRecording || isAnalyzingVideo}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-primary/10 text-primary"
                  title={isRecording ? "Recording in progress..." : isAnalyzingVideo ? "Video analysis in progress..." : "Record screen area"}
                >
                  {(isRecording || isAnalyzingVideo) ? (
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={stopRecording}
                  disabled={disabled}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-destructive/10 text-destructive animate-pulse"
                  title="Stop recording"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </Button>
              )}
            </div>
          </div>

          <div className="relative">
            <Textarea
              ref={internalTextareaRef}
              id="taskDescArea"
              data-field="taskDescription"
              data-merge-pulse={taskState.showMergePulse}
              className={cn(
                "border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft",
                isEmpty ? "border-destructive/20 bg-destructive/5" : "border-border/60",
                taskState.showMergePulse && "animate-pulse-border"
              )}
              value={localValue}
              onChange={handleChange}
              onPaste={handlePaste}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyActivity}
              onKeyUp={handleKeyActivity}
              placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder below or type directly."
              aria-required="true"
              aria-invalid={isEmpty}
              disabled={disabled}
            />

            {isEmpty && (
              <div className="text-xs text-destructive mt-1 pl-1">
                Please enter a task description to proceed
              </div>
            )}

            {(isRecording || isAnalyzingVideo) && (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{isRecording ? "Recording video..." : isAnalyzingVideo ? "Analyzing video..." : null}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => taskActions.cancelVideoAnalysis()}
                  className="h-6 px-2 text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        <VideoRecordingDialog
          isOpen={showVideoDialog}
          onClose={() => setShowVideoDialog(false)}
          onConfirm={(options) => {
            taskActions.startVideoAnalysisRecording(options);
          }}
        />
      </>
    );
  }
);

TaskDescriptionArea.displayName = "TaskDescriptionArea";

export default TaskDescriptionArea;

"use client";

import { Undo2, Redo2 } from "lucide-react";
import React, {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import type { ChangeEvent } from "react";

import { useTextareaResize } from "@/hooks/use-textarea-resize";
import { useScreenRecording } from "@/contexts/screen-recording";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils/utils";
import VoiceTranscription from "./voice-transcription";
import { listen } from "@tauri-apps/api/event";
import { VideoRecordingDialog } from "./video-recording-dialog";
import { useTaskContext } from "../_contexts/task-context";

export interface TaskDescriptionHandle {
  insertTextAtCursorPosition: (text: string) => void;
  appendText: (text: string) => void;
  replaceSelection: (newText: string) => void;
  replaceText: (oldText: string, newText: string) => void;
  flushPendingChanges: () => string; // Immediately flush any pending debounced changes and return current value
  setValue: (value: string, preserveSelection?: boolean) => void;
  getValue: () => string; // Get current value
  // Add properties that use-task-description-state.ts expects
  value: string;
  selectionStart: number;
  selectionEnd: number;
  focus: () => void;
  readonly isFocused: boolean;
  readonly isTyping: boolean;
}

// Define props for the component
interface TaskDescriptionProps {
  value: string;
  onChange: (value: string) => void;
  onInteraction: () => void; // Callback for interaction
  onBlur: () => void; // New callback for blur events to trigger save
  disabled?: boolean; // Flag to disable the component
  // New props for undo/redo and refine task
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

const TaskDescriptionArea = forwardRef<TaskDescriptionHandle, TaskDescriptionProps>(
    function TaskDescriptionArea(
      {
        value,
        onChange,
        onInteraction,
        onBlur,
        disabled = false,
        // New props for undo/redo
        canUndo = false,
        canRedo = false,
        onUndo,
        onRedo,
      }: TaskDescriptionProps,
      ref: React.ForwardedRef<TaskDescriptionHandle>
    ) {
      // Get task context for video analysis state
      const { state: taskState, actions: taskActions } = useTaskContext();
      const { isAnalyzingVideo } = taskState;

      // No local state - use the prop value directly as the single source of truth
      // We'll update the parent immediately for all changes

      // Create an internal ref for the textarea element
      const internalTextareaRef = useRef<HTMLTextAreaElement>(null);

      const { isRecording, stopRecording } = useScreenRecording();
      const [showVideoDialog, setShowVideoDialog] = useState(false);

      // Caret stabilization refs
      const isFocusedRef = React.useRef(false);
      const isUserTypingRef = React.useRef(false);
      const typingIdleTimerRef = React.useRef<number | null>(null);
      const isComposingRef = React.useRef(false);
      const lastSelectionRef = React.useRef<{ start: number; end: number }>({ start: 0, end: 0 });

      // Utility to clamp indices
      const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

      // Track selection precisely via document selectionchange
      React.useEffect(() => {
        const handler = () => {
          const el = internalTextareaRef.current as HTMLTextAreaElement | null;
          if (el && document.activeElement === el) {
            lastSelectionRef.current = {
              start: el.selectionStart ?? 0,
              end: el.selectionEnd ?? 0,
            };
          }
        };
        document.addEventListener('selectionchange', handler);
        return () => document.removeEventListener('selectionchange', handler);
      }, []);

      // Immediate onChange - no debouncing for internal state updates
      // The parent handles its own backend sync debouncing
      const handleValueChange = React.useCallback((newValue: string, opts?: { preserveSelection?: boolean }) => {
        // Avoid redundant updates
        if (newValue === value) {
          return;
        }

        // Immediately notify parent - it's the source of truth
        onChange(newValue);
        onInteraction();

        // Handle caret preservation if needed
        if (opts?.preserveSelection && isFocusedRef.current) {
          const el = internalTextareaRef.current as HTMLTextAreaElement | null;
          if (el) {
            // Restore selection to last known range (clamped to new value length)
            const len = newValue.length;
            const start = clamp(lastSelectionRef.current.start, 0, len);
            const end = clamp(lastSelectionRef.current.end, 0, len);
            // Defer until DOM updates
            requestAnimationFrame(() => {
              if (!el.isConnected) return;
              try {
                el.setSelectionRange(start, end);
              } catch {}
            });
          }
        }
      }, [value, onChange, onInteraction]);

      // Typing detection via keydown/up with idle window
      const TYPING_IDLE_MS = 200;
      const handleKeyActivity = () => {
        isUserTypingRef.current = true;
        if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = window.setTimeout(() => {
          isUserTypingRef.current = false;
          typingIdleTimerRef.current = null;
        }, TYPING_IDLE_MS);
      };

      // Composition handlers for IME
      const handleCompositionStart = () => { isComposingRef.current = true; };
      const handleCompositionEnd = () => { isComposingRef.current = false; };

      // Focus/blur handlers
      const handleFocus = () => { isFocusedRef.current = true; };
      const handleBlur = () => {
        isFocusedRef.current = false;
      };

      // No local storage effects - moved to useTaskDescriptionState hook

      // Removed the duplicate monitor for background job updates
      // This logic is now handled entirely in useTaskDescriptionState.ts

      // Imperative handle for external manipulation
      useImperativeHandle(ref, () => ({
        insertTextAtCursorPosition: (text: string) => {
          const textarea = internalTextareaRef.current;
          if (!textarea) return;
          const start = textarea.selectionStart ?? 0;
          const end = textarea.selectionEnd ?? 0;
          const next = value.slice(0, start) + text + value.slice(end);
          lastSelectionRef.current = { start: start + text.length, end: start + text.length };
          handleValueChange(next, { preserveSelection: true });
        },
        appendText: (text: string, separator = "\n\n") => {
          const next = `${value}${separator}${text}`;
          if (isFocusedRef.current) {
            // Non-disruptive append: keep user where they are
            handleValueChange(next, { preserveSelection: true });
          } else {
            // Not focused: allow tail caret placement
            handleValueChange(next, { preserveSelection: false });
            requestAnimationFrame(() => {
              const e2 = internalTextareaRef.current as HTMLTextAreaElement | null;
              if (e2) {
                try {
                  e2.focus();
                  const end = next.length;
                  e2.setSelectionRange(end, end);
                } catch {}
              }
            });
          }
        },
        replaceSelection: (newText: string) => {
          const el = internalTextareaRef.current as HTMLTextAreaElement | null;
          if (!el) return;
          const start = el.selectionStart ?? 0;
          const end = el.selectionEnd ?? 0;
          const next = value.slice(0, start) + newText + value.slice(end);
          // After replacement, caret at end of inserted text
          lastSelectionRef.current = { start: start + newText.length, end: start + newText.length };
          handleValueChange(next, { preserveSelection: true });
        },
        replaceText: (oldText: string, newText: string) => {
          const next = value.replace(oldText, newText);
          if (next !== value) {
            handleValueChange(next, { preserveSelection: isFocusedRef.current });
          }
        },
        setValue: (newValue: string, preserveSelection = true) => {
          handleValueChange(newValue, { preserveSelection: preserveSelection && isFocusedRef.current });
        },
        getValue: () => value,
        flushPendingChanges: () => {
          // No debouncing anymore, so nothing to flush
          return value;
        },
        get value() { return value; },
        get selectionStart() { return internalTextareaRef.current?.selectionStart ?? 0; },
        get selectionEnd() { return internalTextareaRef.current?.selectionEnd ?? 0; },
        focus: () => internalTextareaRef.current?.focus(),
        get isFocused() { return isFocusedRef.current; },
        get isTyping() { return isUserTypingRef.current; },
      }), [value, handleValueChange]);

      // Optional dev-only latency instrumentation for AC-1/NFR-1 validation
      const latencyMeasurementRef = useRef<number | null>(null);

      // Change handler - immediately update parent
      const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        handleValueChange(newValue);
      }, [handleValueChange]);

      // Use the auto-resize hook to handle textarea height adjustments
      useTextareaResize(internalTextareaRef, value, {
        minHeight: 200,
        maxHeight: 600,
        extraHeight: 50,
      });

      // No need for flush-pending-changes listener - we update immediately now

      // Tauri event handlers for external text insertion
      React.useEffect(() => {
        let unlisten1: (() => void) | undefined;
        let unlisten2: (() => void) | undefined;

        const handleApplyText = (payloadValue: string) => {
          const el = internalTextareaRef.current as HTMLTextAreaElement | null;
          const focused = isFocusedRef.current;

          // Snapshot current selection if focused
          if (el && focused) {
            lastSelectionRef.current = {
              start: el.selectionStart ?? lastSelectionRef.current.start,
              end: el.selectionEnd ?? lastSelectionRef.current.end,
            };
          }

          handleValueChange(payloadValue, { preserveSelection: focused });
        };

        // Subscribe to Tauri events
        const subscribe = async () => {
          try {
            unlisten1 = await listen<string>('apply-text-to-task-description', (event) => {
              handleApplyText(event.payload);
            });

            unlisten2 = await listen<string>('apply-web-search-to-task-description', (event) => {
              const currentValue = value.trim();
              const searchFindings = event.payload.trim();

              // Create XML-formatted task description
              const formattedValue = `<original_task>\n${currentValue}\n</original_task>\n\n<web_search_findings>\n${searchFindings}\n</web_search_findings>`;

              handleApplyText(formattedValue);
            });
          } catch (e) {
            console.error('Error setting up Tauri listeners:', e);
          }
        };

        subscribe();

        return () => {
          try { unlisten1?.(); } catch {}
          try { unlisten2?.(); } catch {}
        };
      }, [handleValueChange, value]);

      // Simple empty check
      const effectiveIsEmpty = !value?.trim();

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
                  !effectiveIsEmpty && "invisible"
                )}
              >
                Required
              </span>
              {/* Undo/Redo buttons next to the label */}
              <div className="flex items-center gap-1 ml-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onUndo}
                  disabled={!canUndo || disabled}
                  title="Undo last change"
                  className="h-6 w-6"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onRedo}
                  disabled={!canRedo || disabled}
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
                  // Insert transcribed text at the cursor position (captured before recording started)
                  const el = internalTextareaRef.current;
                  if (!el) return;

                  // Use the saved selection from before recording started
                  const start = lastSelectionRef.current.start;
                  const end = lastSelectionRef.current.end;

                  const beforeCursor = value.slice(0, start);
                  const afterCursor = value.slice(end);

                  // Add smart spacing: space before if needed, newline after if needed
                  const needsSpaceBefore = beforeCursor.length > 0 &&
                    !beforeCursor.endsWith(' ') &&
                    !beforeCursor.endsWith('\n');
                  const prefix = needsSpaceBefore ? ' ' : '';

                  const trimmedText = text.trim();
                  const newValue = beforeCursor + prefix + trimmedText + afterCursor;

                  // Place cursor after the inserted text
                  const newCursorPos = beforeCursor.length + prefix.length + trimmedText.length;
                  lastSelectionRef.current = { start: newCursorPos, end: newCursorPos };

                  handleValueChange(newValue, { preserveSelection: true });
                }}
                onInteraction={onInteraction}
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
              className={`border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft ${effectiveIsEmpty ? "border-destructive/20 bg-destructive/5" : "border-border/60"}`}
              value={value}
              onChange={handleChange}
              onFocus={handleFocus}
              onBlur={(_e) => {
                handleBlur();
                // Trigger parent's onBlur for any cleanup/save operations
                if (onBlur) {
                  requestAnimationFrame(() => {
                    onBlur();
                  });
                }
              }}
              onKeyDown={(_e) => {
                handleKeyActivity();
                // Dev-only input latency measurement
                if (process.env.NODE_ENV !== "production" || (window as any).__DEBUG_INPUT_LATENCY__) {
                  latencyMeasurementRef.current = performance.now();
                  requestAnimationFrame(() => {
                    if (latencyMeasurementRef.current !== null) {
                      const latency = Math.round(performance.now() - latencyMeasurementRef.current);
                      if (latency > 16) {
                        console.debug(`[TaskDesc] key→paint ${latency}ms (> 16ms target)`);
                      }
                      latencyMeasurementRef.current = null;
                    }
                  });
                }
              }}
              onKeyUp={handleKeyActivity}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder below or type directly."
              aria-required="true"
              aria-invalid={effectiveIsEmpty}
              disabled={disabled}
              loadingIndicator={
                <div className="flex items-center bg-background backdrop-blur-sm px-3 py-2 rounded-lg border border-border shadow-soft">
                  <svg
                    className="animate-spin h-3 w-3 mr-1.5 text-primary"
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
                  <span className="text-xs font-medium text-foreground">Loading...</span>
                </div>
              }
            />

            {effectiveIsEmpty && (
              <div className="text-xs text-destructive mt-1 pl-1">
                Please enter a task description to proceed
              </div>
            )}
            
            {(isRecording || isAnalyzingVideo) && (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 0 14 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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

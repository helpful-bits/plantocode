"use client";

import { Undo2, Redo2 } from "lucide-react";
import {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import type { ChangeEvent } from "react";

import { useTextareaResize } from "@/hooks/use-textarea-resize";
import { useScreenRecording } from "@/contexts/screen-recording";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils/utils";
import VoiceTranscription from "./voice-transcription";
import { listen, emit } from "@tauri-apps/api/event";
import { VideoRecordingDialog } from "./video-recording-dialog";
import { useTaskContext } from "../_contexts/task-context";

export interface TaskDescriptionHandle {
  insertTextAtCursorPosition: (text: string) => void;
  appendText: (text: string) => void;
  replaceSelection: (newText: string) => void;
  replaceText: (oldText: string, newText: string) => void;
  flushPendingChanges: () => string; // Immediately flush any pending debounced changes and return current value
  setValue: (value: string) => void;
  getValue: () => string; // Get current value
  // Add properties that use-task-description-state.ts expects
  value: string;
  selectionStart: number;
  selectionEnd: number;
  focus: () => void;
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
      const { setVideoAnalysisPrompt } = taskActions;
      // Keep ref parameter
      // Local state for responsive input handling
      const [internalValue, setInternalValue] = useState(value);
      const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
      
      // Create an internal ref for the textarea element
      const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
      
      const { startRecording, isRecording } = useScreenRecording();
      const [showVideoDialog, setShowVideoDialog] = useState(false);
      
      // Sync internal value with prop value when it changes externally
      useEffect(() => {
        setInternalValue(value);
      }, [value]);

      // Debounced onChange for performance, with immediate flush capability
      const debouncedOnChange = useCallback(
        (newValue: string) => {
          if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
          }
          debounceTimeoutRef.current = setTimeout(() => {
            onChange(newValue);
          }, 1000); // Longer debounce to prevent lag during active typing, with immediate flush on blur
        },
        [onChange]
      );
      
      // Insert or replace text at the stored cursor or selection range
      const insertTextAtCursor = useCallback(
        (newText: string, start: number, end: number) => {
          if (!internalTextareaRef.current) {
            return;
          }


          // Validate that text is not empty
          if (!newText || newText.trim() === "") {
            return;
          }

          // Calculate the new value directly
          const originalText = internalValue;
          const before = originalText.slice(0, start);
          const after = originalText.slice(end);
          const newValue = before + newText + after;

          // Update local state and debounce parent update
          setInternalValue(newValue);
          debouncedOnChange(newValue);
          onInteraction(); // Notify parent

          // Calculate new cursor position
          const newPosition = start + newText.length;

          // Focus and set selection range after re-render
          setTimeout(() => {
            if (internalTextareaRef.current) {
              internalTextareaRef.current.focus();
              internalTextareaRef.current.setSelectionRange(
                newPosition,
                newPosition
              );
            }
          }, 0);
        },
        [internalValue, debouncedOnChange, onInteraction]
      );

      // No local storage effects - moved to useTaskDescriptionState hook

      // Removed the duplicate monitor for background job updates
      // This logic is now handled entirely in useTaskDescriptionState.ts

      // Simplified ref implementation
      useImperativeHandle(ref, () => ({
        insertTextAtCursorPosition: (text: string) => {
          const textarea = internalTextareaRef.current;
          if (!textarea) return;
          insertTextAtCursor(text, textarea.selectionStart, textarea.selectionEnd);
        },
        appendText: (text: string) => {
          const separator = internalValue.trim() ? "\n\n" : "";
          insertTextAtCursor(separator + text, internalValue.length, internalValue.length);
        },
        replaceSelection: (newText: string) => {
          const textarea = internalTextareaRef.current;
          if (!textarea || textarea.selectionStart === textarea.selectionEnd) return;
          insertTextAtCursor(newText, textarea.selectionStart, textarea.selectionEnd);
        },
        replaceText: (oldText: string, newText: string) => {
          const updatedText = internalValue.replace(oldText, newText);
          if (updatedText !== internalValue) {
            setInternalValue(updatedText);
            debouncedOnChange(updatedText);
            onInteraction();
          }
        },
        flushPendingChanges: () => {
          // Immediately flush any pending debounced changes
          if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
          }
          // Call onChange with current internal value to ensure it's saved
          onChange(internalValue);
          // Return the current value so caller can use it immediately
          return internalValue;
        },
        get value() { return internalValue; },
        get selectionStart() { return internalTextareaRef.current?.selectionStart ?? 0; },
        get selectionEnd() { return internalTextareaRef.current?.selectionEnd ?? 0; },
        focus: () => internalTextareaRef.current?.focus(),
        setValue: (value: string) => {
          setInternalValue(value);
          debouncedOnChange(value);
          onInteraction();
        },
        getValue: () => internalValue,
      }), [insertTextAtCursor, internalValue, debouncedOnChange, onInteraction, onChange]);



      // Simplified change handler
      const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setInternalValue(newValue);
        debouncedOnChange(newValue);
        onInteraction();
      }, [setInternalValue, debouncedOnChange, onInteraction]);

      // Use the auto-resize hook to handle textarea height adjustments
      useTextareaResize(internalTextareaRef, internalValue, {
        minHeight: 200,
        maxHeight: 600,
        extraHeight: 50,
      });

      // Add event listener for flush-pending-changes event from text improvement
      useEffect(() => {
        const handleFlushEvent = () => {
          // Immediately flush any pending debounced changes
          if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
            debounceTimeoutRef.current = null;
            onChange(internalValue);
          }
        };

        const element = internalTextareaRef.current;
        if (element) {
          element.addEventListener('flush-pending-changes', handleFlushEvent);
          return () => {
            element.removeEventListener('flush-pending-changes', handleFlushEvent);
          };
        }
        
        // Return empty cleanup function if no element
        return () => {};
      }, [internalValue, onChange]);

      // Add event listener for apply-text-to-task-description event
      useEffect(() => {
        const handleApplyTextEvent = async () => {
          const unlisten = await listen<string>('apply-text-to-task-description', (event) => {
            if (ref && typeof ref === 'object' && ref.current) {
              ref.current.setValue(event.payload);
            }
          });
          
          return unlisten;
        };
        
        let unlisten: (() => void) | undefined;
        
        handleApplyTextEvent().then((unlistenFn) => {
          unlisten = unlistenFn;
        });
        
        return () => {
          if (unlisten) {
            unlisten();
          }
        };
      }, [ref]);

      // Add event listener for apply-web-search-to-task-description event (with XML formatting)
      useEffect(() => {
        const handleApplyWebSearchEvent = async () => {
          const unlisten = await listen<string>('apply-web-search-to-task-description', (event) => {
            if (ref && typeof ref === 'object' && ref.current) {
              const currentValue = ref.current.value || '';
              const originalTask = currentValue.trim();
              const searchFindings = event.payload.trim();
              
              // Create XML-formatted task description
              const formattedValue = `<original_task>\n${originalTask}\n</original_task>\n\n<web_search_findings>\n${searchFindings}\n</web_search_findings>`;
              
              ref.current.setValue(formattedValue);
            }
          });
          
          return unlisten;
        };
        
        let unlisten: (() => void) | undefined;
        
        handleApplyWebSearchEvent().then((unlistenFn) => {
          unlisten = unlistenFn;
        });
        
        return () => {
          if (unlisten) {
            unlisten();
          }
        };
      }, [ref]);

      // Add event listener for recording-finished event
      useEffect(() => {
        const handleRecordingFinished = async () => {
          const unlisten = await listen<{ path: string; durationMs: number; frameRate: number }>('recording-finished', (event) => {
            // Emit the event for the task state hook to handle
            emit('recording-finished', event.payload).catch(console.error);
          });
          
          return unlisten;
        };
        
        let unlisten: (() => void) | undefined;
        
        handleRecordingFinished().then((unlistenFn) => {
          unlisten = unlistenFn;
        });
        
        return () => {
          if (unlisten) {
            unlisten();
          }
        };
      }, []);

      // Simple empty check
      const effectiveIsEmpty = !internalValue?.trim();

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
                  if (ref && typeof ref === 'object' && ref.current) {
                    ref.current.appendText(text);
                  }
                }}
                onInteraction={onInteraction}
                textareaRef={ref as React.RefObject<TaskDescriptionHandle | null>}
                disabled={disabled}
              />
              
              {!isRecording ? (
                <Button
                  onClick={() => {
                    if (!isAnalyzingVideo) {
                      setShowVideoDialog(true);
                    }
                  }}
                  disabled={disabled || isAnalyzingVideo}
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 hover:bg-primary/10 text-primary"
                  title={isAnalyzingVideo ? "Video analysis in progress..." : "Record screen area"}
                >
                  {isAnalyzingVideo ? (
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
              ) : null}
            </div>
          </div>

          <div className="relative">
            <Textarea
              ref={internalTextareaRef}
              id="taskDescArea"
              data-field="taskDescription"
              className={`border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft ${effectiveIsEmpty ? "border-destructive/20 bg-destructive/5" : "border-border/60"}`}
              value={internalValue}
              onChange={handleChange}
              onBlur={(_e) => {
                // Clear any pending debounce timeout
                if (debounceTimeoutRef.current) {
                  clearTimeout(debounceTimeoutRef.current);
                  debounceTimeoutRef.current = null;
                }
                
                // Always propagate current internal value to parent to ensure sync
                onChange(internalValue);
                
                // Defer onBlur call to next event loop tick to prevent race conditions
                if (onBlur) {
                  setTimeout(() => {
                    onBlur();
                  }, 0);
                }
              }}
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
            
            {isAnalyzingVideo && (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Analyzing video...</span>
              </div>
            )}
          </div>
        </div>
        
        <VideoRecordingDialog
          isOpen={showVideoDialog}
          onClose={() => setShowVideoDialog(false)}
          onStartRecording={(prompt, recordAudio, audioDeviceId, frameRate) => {
            // Set the video analysis prompt
            setVideoAnalysisPrompt(prompt);
            
            // Close the dialog
            setShowVideoDialog(false);
            
            // Start recording
            startRecording({ recordAudio, audioDeviceId, frameRate });
            
            // Note: The actual video analysis will be triggered from the task-section.tsx
            // when the user clicks the "Analyze Video" button
          }}
        />
        </>
      );
    }
  );

TaskDescriptionArea.displayName = "TaskDescriptionArea";

export default TaskDescriptionArea;

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
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils/utils";
import VoiceTranscription from "./voice-transcription";

export interface TaskDescriptionHandle {
  insertTextAtCursorPosition: (text: string) => void;
  appendText: (text: string) => void;
  replaceSelection: (newText: string) => void;
  replaceText: (oldText: string, newText: string) => void;
  flushPendingChanges: () => string; // Immediately flush any pending debounced changes and return current value
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
      // Keep ref parameter
      // Local state for responsive input handling
      const [internalValue, setInternalValue] = useState(value);
      const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
      
      // Create an internal ref for the textarea element
      const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
      
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

      // Simple empty check
      const effectiveIsEmpty = !internalValue?.trim();

      return (
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
          </div>
        </div>
      );
    }
  );

TaskDescriptionArea.displayName = "TaskDescriptionArea";

export default TaskDescriptionArea;

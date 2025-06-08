"use client";

import { Sparkles, Loader2 } from "lucide-react";
import {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import type { ChangeEvent } from "react";

import { useNotification } from "@/contexts/notification-context";
import { useSessionActionsContext } from "@/contexts/session";
import { useTextareaResize } from "@/hooks/use-textarea-resize";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/utils/utils";

export interface TaskDescriptionHandle {
  insertTextAtCursorPosition: (text: string) => void;
  appendText: (text: string) => void;
  replaceSelection: (newText: string) => void;
  replaceText: (oldText: string, newText: string) => void;
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
  isImproving: boolean; // Required prop instead of optional
  onImproveSelection: (
    selectedText: string,
    selectionStart?: number,
    selectionEnd?: number
  ) => Promise<void>; // Required prop instead of optional
  disabled?: boolean; // Flag to disable the component
}

const TaskDescriptionArea = forwardRef<TaskDescriptionHandle, TaskDescriptionProps>(
    function TaskDescriptionArea(
      {
        value,
        onChange,
        onInteraction,
        onBlur,
        isImproving,
        onImproveSelection,
        disabled = false,
      }: TaskDescriptionProps,
      ref: React.ForwardedRef<TaskDescriptionHandle>
    ) {
      // Keep ref parameter
      // Minimal state for selection tracking
      const { showNotification } = useNotification();
      const sessionActions = useSessionActionsContext();
      // Create an internal ref for the textarea element
      const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
      const [hasActiveSelection, setHasActiveSelection] = useState(false);

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
          const originalText = value;
          const before = originalText.slice(0, start);
          const after = originalText.slice(end);
          const newValue = before + newText + after;

          // Update state via the onChange prop
          onChange(newValue);
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
        [onChange, onInteraction, value]
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
          const separator = value.trim() ? "\n\n" : "";
          insertTextAtCursor(separator + text, value.length, value.length);
        },
        replaceSelection: (newText: string) => {
          const textarea = internalTextareaRef.current;
          if (!textarea || textarea.selectionStart === textarea.selectionEnd) return;
          insertTextAtCursor(newText, textarea.selectionStart, textarea.selectionEnd);
        },
        replaceText: (oldText: string, newText: string) => {
          const updatedText = value.replace(oldText, newText);
          if (updatedText !== value) {
            onChange(updatedText);
            onInteraction();
          }
        },
        get value() { return value; },
        get selectionStart() { return internalTextareaRef.current?.selectionStart ?? 0; },
        get selectionEnd() { return internalTextareaRef.current?.selectionEnd ?? 0; },
        focus: () => internalTextareaRef.current?.focus(),
      }), [insertTextAtCursor, value, onChange, onInteraction]);

      // Simplified selection tracking
      const handleSelect = () => {
        const textarea = internalTextareaRef.current;
        setHasActiveSelection(textarea ? textarea.selectionStart !== textarea.selectionEnd : false);
      };

      // Simplified improvement handler
      const handleImproveSelection = async () => {
        const textarea = internalTextareaRef.current;
        if (!textarea) return;

        const { selectionStart, selectionEnd } = textarea;
        if (selectionStart === selectionEnd) {
          showNotification({ title: "No text selected", message: "Please select some text to improve", type: "warning" });
          return;
        }

        const selectedText = value.slice(selectionStart, selectionEnd).trim();
        if (!selectedText) {
          showNotification({ title: "No text selected", message: "Please select some non-empty text to improve", type: "warning" });
          return;
        }

        try {
          await onImproveSelection(selectedText, selectionStart, selectionEnd);
        } catch {
          showNotification({ title: "Error improving text", message: "An unexpected error occurred while improving text", type: "error" });
        }
      };

      // The hasSelection const has been replaced by the hasActiveSelection state

      // Simplified change handler
      const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
        onInteraction();
      }, [onChange, onInteraction]);

      // Use the auto-resize hook to handle textarea height adjustments
      useTextareaResize(internalTextareaRef, value, {
        minHeight: 200,
        maxHeight: 600,
        extraHeight: 50,
      });

      // Simple empty check
      const effectiveIsEmpty = !value?.trim();

      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label
                htmlFor="taskDescArea"
                className="font-semibold text-lg text-foreground"
              >
                Task Description:
              </label>
              <span
                className={cn(
                  "text-xs bg-destructive/10 backdrop-blur-sm text-destructive px-2 py-0.5 rounded-md border border-destructive/20",
                  !effectiveIsEmpty && "invisible"
                )}
              >
                Required
              </span>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleImproveSelection}
              disabled={!hasActiveSelection || disabled}
              isLoading={isImproving}
              loadingIcon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
              className="h-7 text-xs px-3"
            >
              <Sparkles className="h-3.5 w-3.5 mr-2" />
              Improve Selection
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-balance">
            Uses AI to refine the clarity and grammar of the selected text.
          </p>
          <div
            className={`relative ${effectiveIsEmpty ? "border-2 border-destructive/20 rounded-xl" : ""}`}
          >
            <Textarea
              ref={internalTextareaRef}
              id="taskDescArea"
              className={`border border-border/60 rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft ${effectiveIsEmpty ? "border-destructive/20 bg-destructive/5" : ""}`}
              value={value}
              onChange={handleChange}
              onSelect={handleSelect}
              onBlur={(_e) => {
                // Call the original onBlur handler if provided
                if (onBlur) {
                  onBlur();
                }
                // Flush any pending saves to ensure data is persisted immediately
                void sessionActions.flushSaves?.();
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

            <div
              className={cn(
                "text-xs text-destructive mt-1 pl-1",
                !effectiveIsEmpty && "invisible"
              )}
            >
              Please enter a task description to proceed
            </div>
          </div>
        </div>
      );
    }
  );

TaskDescriptionArea.displayName = "TaskDescriptionArea";

export default TaskDescriptionArea;

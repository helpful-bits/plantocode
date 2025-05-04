"use client";

import { useState, useCallback, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { improveSelectedTextAction } from "@/actions/text-improvement-actions";
import { useBackgroundJobs, useBackgroundJob } from "@/lib/contexts/background-jobs-context";

// Extend Window interface to include toast
declare global {
  interface Window {
    toast?: (options: {
      title: string;
      description: string;
      status: string;
    }) => void;
  }
}

export interface TaskDescriptionHandle {
  insertTextAtCursorPosition: (text: string) => void;
  appendText: (text: string) => void;
  replaceSelection: (newText: string) => void;
}

// Define props for the component
interface TaskDescriptionProps {
  value: string;
  onChange: (value: string) => void;
  onInteraction: () => void; // Callback for interaction
  isImproving?: boolean;
  textImprovementJobId?: string | null;
  onImproveSelection?: (selectedText: string) => Promise<void>;
}

export default forwardRef<TaskDescriptionHandle, TaskDescriptionProps>(function TaskDescriptionArea({
  value,
  onChange,
  onInteraction,
  isImproving: externalIsImproving,
  textImprovementJobId: externalImproveJobId,
  onImproveSelection: externalImproveSelection,
}: TaskDescriptionProps, ref) { // Keep ref parameter
  // State related to "Improve Selection"
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(0);
  const [isImproving, setIsImproving] = useState(false);
  const [improveJobId, setImproveJobId] = useState<string | null>(null);
  const { refreshJobs } = useBackgroundJobs();
  
  // Use either the component's internal job ID or the externally provided one
  const effectiveImproveJobId = externalImproveJobId || improveJobId;
  const effectiveIsImproving = externalIsImproving || isImproving;
  
  const improveJob = useBackgroundJob(effectiveImproveJobId);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Use window object to get the current URL to create project-specific localStorage keys
  const getProjectPathSegment = () => {
    // Safe access to window object with fallback for SSR
    if (typeof window !== 'undefined') {
      const projectParam = new URLSearchParams(window.location.search).get('project');
      if (projectParam) {
        // Create a safe key fragment from the project path
        return encodeURIComponent(projectParam.replace(/[\/\\?%*:|"<>]/g, '_')).substring(0, 50);
      }
    }
    return 'default';
  };
  
  // Create a project-specific local storage key to prevent conflicts between projects
  const localStorageKey = `task-description-backup-${getProjectPathSegment()}`;
  
  // Insert or replace text at the stored cursor or selection range
  const insertTextAtCursor = useCallback((newText: string, start: number, end: number) => {
    if (!textareaRef.current) {
      console.error("Cannot insert text: textareaRef is not available");
      return;
    }
    
    console.log("Inserting text at cursor:", newText.substring(0, 50) + (newText.length > 50 ? '...' : ''), 
      "position:", start, "to", end);
    
    const textarea = textareaRef.current;
    textarea.focus();
    const originalText = textarea.value;

    // Validate that text is not empty
    if (!newText || newText.trim() === '') {
      console.warn("Attempted to insert empty text");
      return;
    }

    textarea.setSelectionRange(start, end);

    // Use document.execCommand for better undo support in browsers that support it
    try {
      document.execCommand('insertText', false, newText);
      // Manually dispatch input event to ensure React state updates
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);
    } catch (e) {
      console.log("execCommand failed, falling back to direct value assignment:", e);
      const before = originalText.slice(0, start);
      const after = originalText.slice(end);
      textarea.value = before + newText + after;
      // Manually dispatch input event to ensure React state updates
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event); // Re-dispatch for consistency
    }

    // Ensure state is updated even if execCommand worked
    if (textarea.value !== originalText) {
      console.log("Text inserted successfully, updating state");
      onChange(textarea.value);
      onInteraction(); // Notify parent
    } else {
      console.warn("Text insertion did not change textarea value");
    }

    const newPosition = start + newText.length;
    textarea.setSelectionRange(newPosition, newPosition);
    setSelectionStart(newPosition); // Update selection state
    setSelectionEnd(newPosition);
  }, [onChange, onInteraction]);
  
  // Initialize from local storage on mount
  useEffect(() => {
    try {
      // Only restore from backup if current value is empty
      if (!value || value.trim() === '') {
        const backup = localStorage.getItem(localStorageKey);
        if (backup && backup.length > 0) {
          console.log('[TaskDescription] Restoring from local storage backup:', localStorageKey, `(first ${backup.substring(0, 20)}... of ${backup.length} chars)`);
          onChange(backup);
          onInteraction();
        } else {
          console.log('[TaskDescription] No local storage backup found or backup is empty');
        }
      } else {
        console.log('[TaskDescription] Not restoring from local storage - value already exists:', `(first ${value.substring(0, 20)}... of ${value.length} chars)`);
      }
    } catch (error) {
      console.error('[TaskDescription] Error accessing localStorage:', error);
    }
  }, [localStorageKey, onChange, onInteraction, value]);
  
  // Update local storage when value changes
  useEffect(() => {
    try {
      if (value && value.trim() !== '') {
        console.log('[TaskDescription] Saving to localStorage:', localStorageKey, `(${value.length} chars)`);
        localStorage.setItem(localStorageKey, value);
      }
    } catch (error) {
      console.error('[TaskDescription] Error saving to localStorage:', error);
    }
  }, [value, localStorageKey]);

  // Monitor background job updates for text improvement
  useEffect(() => {
    if (effectiveImproveJobId && improveJob) {
      if (improveJob.status === 'completed' && improveJob.response) {
        // Validate that the response is a valid string and not a UUID
        if (typeof improveJob.response === 'string' && 
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(improveJob.response)) {
          
          // Get the stored selection positions or use defaults
          const start = selectionStart || 0;
          const end = selectionEnd || 0;
          
          // Insert the improved text from the response field
          insertTextAtCursor(improveJob.response, start, end);
          
          // Show success toast if not handled by parent component
          if (!externalImproveSelection && typeof window !== 'undefined' && window.toast) {
            window.toast({
              title: "Text improved",
              description: "The selected text has been improved successfully.",
              status: "success"
            });
          }
        } else {
          console.warn("Received invalid improved text:", improveJob.response);
          if (!externalImproveSelection && typeof window !== 'undefined' && window.toast) {
            window.toast({
              title: "Text improvement failed",
              description: "Received invalid improved text. Please try again.",
              status: "error"
            });
          }
        }
        
        // Reset state after handling the completed job (if using internal state)
        if (!externalImproveSelection) {
          setImproveJobId(null);
          setIsImproving(false);
        }
      } else if (improveJob.status === 'failed' || improveJob.status === 'canceled') {
        // Handle job failure (if using internal state)
        if (!externalImproveSelection && typeof window !== 'undefined' && window.toast) {
          window.toast({
            title: "Text improvement failed",
            description: improveJob.errorMessage || "An error occurred while improving the text.",
            status: "error"
          });
          
          // Reset state after handling the failed job
          setImproveJobId(null);
          setIsImproving(false);
        }
      }
    }
  }, [improveJob, effectiveImproveJobId, selectionStart, selectionEnd, insertTextAtCursor, externalImproveSelection]);

  // Expose the insertTextAtCursor method via ref
  useImperativeHandle(ref, () => ({
    insertTextAtCursorPosition: (text: string) => {
      const currentSelectionStart = textareaRef.current?.selectionStart ?? value.length;
      const currentSelectionEnd = textareaRef.current?.selectionEnd ?? value.length;
      insertTextAtCursor(text, currentSelectionStart, currentSelectionEnd);
    },
    appendText: (text: string) => {
      // Append text at the end with 2 new lines in between
      const separator = value.trim().length > 0 ? "\n\n" : "";
      insertTextAtCursor(separator + text, value.length, value.length);
    },
    replaceSelection: (newText: string) => {
      const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
      const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;
      
      if (currentSelectionStart === currentSelectionEnd) {
        console.warn("Cannot replace selection: no text is selected");
        return;
      }
      
      insertTextAtCursor(newText, currentSelectionStart, currentSelectionEnd);
    }
  }));

  // Capture and store the selection positions whenever the user selects text
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionStart(e.currentTarget.selectionStart);
    setSelectionEnd(e.currentTarget.selectionEnd);
  };

  // Handler function to improve selected text
  const handleImproveSelection = async () => {
    // If using external improvement handler, delegate to it
    if (externalImproveSelection) {
      const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
      const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;
      
      if (currentSelectionStart === currentSelectionEnd) return;
      
      const selectedText = value?.slice(currentSelectionStart, currentSelectionEnd) || "";
      if (!selectedText.trim()) return;
      
      // Store selection positions for later use when the job completes
      setSelectionStart(currentSelectionStart);
      setSelectionEnd(currentSelectionEnd);
      
      // Call the parent-provided improvement function
      await externalImproveSelection(selectedText);
      return;
    }
    
    // Otherwise use the internal implementation
    const originalFocus = document.activeElement; // Remember focus
    const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
    const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;

    if (currentSelectionStart === currentSelectionEnd) return;

    const selectedText = value?.slice(currentSelectionStart, currentSelectionEnd) || "";
    if (!selectedText.trim()) return;

    // Store selection positions for later use when the job completes
    setSelectionStart(currentSelectionStart);
    setSelectionEnd(currentSelectionEnd);
    setIsImproving(true);
    
    try {
      // Use window.location.search to get the project parameter
      const projectDir = typeof window !== 'undefined' ? 
        new URLSearchParams(window.location.search).get('project') || undefined : undefined;
        
      // Call the server action with project directory if available
      const result = await improveSelectedTextAction(selectedText, projectDir);
      
      // First, check if the result is a background job
      if (result.isSuccess && result.data && typeof result.data === 'object' && 'isBackgroundJob' in result.data) {
        // Store the job ID to monitor for completion
        setImproveJobId(result.data.jobId);
        
        // Refresh jobs to ensure we get the latest status
        await refreshJobs();
        
        // Show notification to user using toast if available
        if (typeof window !== 'undefined' && window.toast) {
          window.toast({
            title: "Text improvement in progress",
            description: "We're processing your request. The improved text will be available shortly.",
            status: "info"
          });
        }
      } else if (result.isSuccess && result.data) {
        // Handle immediate result (less likely with the new implementation)
        // Check if result.data is a valid string and not a UUID
        if (typeof result.data === 'string' && 
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.data)) {
          insertTextAtCursor(result.data, currentSelectionStart, currentSelectionEnd);
          setIsImproving(false);
        } else {
          console.warn("Received invalid data format for text improvement:", result.data);
          setIsImproving(false);
          if (typeof window !== 'undefined' && window.toast) {
            window.toast({
              title: "Text improvement failed",
              description: "Received invalid improved text. Please try again.",
              status: "error"
            });
          }
        }
      } else {
        // Handle unsuccessful result
        setIsImproving(false);
        if (typeof window !== 'undefined' && window.toast) {
          window.toast({
            title: "Text improvement failed",
            description: result.message || "Failed to improve text. Please try again.",
            status: "error"
          });
        }
      }
      
      // Reset selection after improving text
      setSelectionStart(textareaRef.current?.selectionStart || 0);
      setSelectionEnd(textareaRef.current?.selectionStart || 0);
    } catch (error) {
      console.error("Error improving text:", error);
      setIsImproving(false);
      if (typeof window !== 'undefined' && window.toast) {
        window.toast({
          title: "Text improvement failed",
          description: error instanceof Error ? error.message : "An unexpected error occurred",
          status: "error"
        });
      }
    } finally {
      // Restore focus if textarea had it
      if (originalFocus === textareaRef.current) textareaRef.current?.focus();
    }
  };

  const hasSelection = !!textareaRef.current && textareaRef.current.selectionStart !== textareaRef.current.selectionEnd;

  // Update handler to ensure local storage backup
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      // Save to local storage immediately
      localStorage.setItem(localStorageKey, e.target.value);
    } catch (error) {
      console.error('[TaskDescription] Error saving to localStorage:', error);
    }
    
    // Call original onChange handler
    onChange(e.target.value);
    onInteraction();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="taskDescArea" className="font-semibold text-lg text-foreground">Task Description:</label>
        <Button
          type="button"
          variant="secondary" size="sm"
          onClick={handleImproveSelection}
          disabled={effectiveIsImproving || !hasSelection}
          className="h-7 text-xs px-2"
        >
          {effectiveIsImproving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1" />)} Improve Selection
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">Uses AI to refine the clarity and grammar of the selected text.</p>
      <Textarea // Use the Textarea component
        ref={textareaRef} // Add ref to Textarea
        id="taskDescArea" // Ensure ID matches htmlFor
        className="border rounded bg-background/80 text-foreground p-2 min-h-[150px] w-full resize-y" // Allow vertical resize
        value={value}
        onChange={handleChange} // Use the new handler that includes localStorage backup
        onSelect={handleSelect}
        placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder below or type directly."
      />
    </div>
  );
}); 
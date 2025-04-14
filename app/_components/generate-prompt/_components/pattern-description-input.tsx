"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react"; // Import Loader2
import { improvePatternDescriptionAction } from "@/actions/text-improvement-actions";

interface PatternDescriptionInputProps {
  value: string;
  onChange?: (value: string) => void;
  onInteraction?: () => void; // Notifies parent of user interaction - making it optional
  onGenerateRegex: () => void;
  isGenerating?: boolean; // Making this optional to avoid type issues
  generationError?: string; // Making this optional to avoid type issues
  codebaseStructure?: string;
}

export default function PatternDescriptionInput({
  value,
  onChange,
  onInteraction = () => {},
  onGenerateRegex,
  isGenerating = false,
  generationError = '',
  codebaseStructure,
}: PatternDescriptionInputProps) {
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(0);
  const [isImproving, setIsImproving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTranscribedText = useCallback((text: string) => {
    const currentText = textareaRef.current?.value || '';
    const updatedText = (currentText ? currentText + " " + text : text).trim();
    if (textareaRef.current) {
      textareaRef.current.value = updatedText;
      // Trigger an input event to ensure React updates
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textareaRef.current.dispatchEvent(event);
    }
    if (onChange) {
      onChange(updatedText);
    }
    onInteraction(); // Notify parent about interaction
  }, [onInteraction, onChange]);

  const handleCorrectionComplete = useCallback(() => {
  }, []); // Empty dependency array for handleCorrectionComplete

  // Capture and store the selection positions whenever the user selects text
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionStart(e.currentTarget.selectionStart);
    setSelectionEnd(e.currentTarget.selectionEnd);
  };

  const insertTextAtCursor = useCallback((newText: string, start: number, end: number) => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.focus();
    const originalText = textarea.value;

    // Check if the selection range is still valid
    if (start > originalText.length || end > originalText.length) {
      console.warn("Selection range is out of bounds. Inserting at the end.");
      start = originalText.length;
      end = originalText.length;
    }

    textarea.setSelectionRange(start, end);

    // Use document.execCommand for better undo support in browsers that support it
    try {
      document.execCommand('insertText', false, newText);
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event);
    } catch (e) {
      // Fallback if execCommand fails or is not supported
      const before = textarea.value.slice(0, selectionStart);
      const after = textarea.value.slice(selectionEnd);
      textarea.value = before + newText + after;
      const event = new InputEvent('input', { bubbles: true, cancelable: true });
      textarea.dispatchEvent(event); // Re-dispatch for consistency
    }

    // Ensure state is updated even if execCommand worked
    if (textarea.value !== originalText) {
      if (onChange) onChange(textarea.value); // Update parent state
      onInteraction();
    }

    const newPosition = start + newText.length;
    textarea.setSelectionRange(newPosition, newPosition);
    setSelectionStart(newPosition); // Update selection state
    setSelectionEnd(newPosition);
  }, [onChange, onInteraction]);

  const handleImproveSelection = async () => {
    const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
    const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;

    if (currentSelectionStart === currentSelectionEnd) return;

    const selectedText = value?.slice(currentSelectionStart, currentSelectionEnd) || "";
    if (!selectedText.trim()) return;

    setIsImproving(true);
    try {
      const result = await improvePatternDescriptionAction(selectedText, codebaseStructure);
      if (result.isSuccess && result.data) {
        insertTextAtCursor(result.data, currentSelectionStart, currentSelectionEnd);
      }
      // Reset selection after improving
    } catch (error) {
      console.error("Error improving pattern description:", error);
    } finally {
      setIsImproving(false);
    }
  };

  const hasSelection = !!textareaRef.current && textareaRef.current.selectionStart !== textareaRef.current.selectionEnd;

  return (
    <div className="flex flex-col gap-3 bg-card p-5 rounded-lg shadow-sm border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-muted-foreground">
          Describe the types of files or content you want to find (e.g., &quot;React components using useState&quot;, &quot;Markdown files with TODOs&quot;). AI will generate regex patterns.
        </div>
        
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleImproveSelection}
          disabled={isImproving || !hasSelection}
          className="h-7 text-xs px-2 ml-2 whitespace-nowrap"
        >
          {isImproving ? "Improving..." : "Improve Selection"}
        </Button>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onSelect={handleSelect}
        onChange={(e) => {
          const newValue = e.target.value;
          if (onChange) {
            onChange(newValue);
          }
          onInteraction(); // Notify parent about interaction
        }}
        placeholder="Enter your description here..."
        className="resize-y min-h-[120px] bg-background/80"
      />
      <Button // Use primary variant for generate regex
        type="button" // Added type="button"
        size="sm"
        onClick={onGenerateRegex}
        disabled={isGenerating || !value.trim()} // Remove hasAnthropicKey check
        className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
        title={!value.trim() ? "Enter a description first" : ""}
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            <span>Generating...</span>
          </>
        ) : (
          "Generate Regex"
        )}
      </Button>
        
      
      
      {generationError && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded mt-1">{generationError}</div>
      )}
    </div>
  );
}

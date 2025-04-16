"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea"; // Keep Textarea import
import { Button } from "@/components/ui/button"; // Keep Button import
import { improvePatternDescriptionAction } from "@/actions/text-improvement-actions"; // Keep text-improvement-actions import
import { Loader2 } from "lucide-react"; // Import Loader2

interface PatternDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerateRegex: () => void;
  isGenerating: boolean;
  generationError: string;
  onInteraction: () => void;
}

export default function PatternDescriptionInput({
  value,
  onChange,
  onGenerateRegex,
  isGenerating = false,
  generationError = '',
  onInteraction = () => {},
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
      textareaRef.current.dispatchEvent(event); // Use dispatchEvent
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

  const insertTextAtCursor = useCallback((newText: string, start: number, end: number) => { // Keep function
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.focus();
    const originalText = textarea.value;

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
    // Move cursor after inserted text
    const newPosition = start + newText.length;
    textarea.setSelectionRange(newPosition, newPosition);
    setSelectionStart(newPosition); // Update selection state
    setSelectionEnd(newPosition);
  }, [onChange, onInteraction, selectionStart, selectionEnd]);

  const handleImproveSelection = async () => {
    const currentSelectionStart = textareaRef.current?.selectionStart ?? 0;
    const currentSelectionEnd = textareaRef.current?.selectionEnd ?? 0;
    const originalFocus = document.activeElement; // Remember focus

    if (currentSelectionStart === currentSelectionEnd) return;

    const selectedText = value?.slice(currentSelectionStart, currentSelectionEnd) || "";
    if (!selectedText.trim()) return;

    setIsImproving(true);
    try {
      const result = await improvePatternDescriptionAction(selectedText);
      if (result.isSuccess && result.data) {
        insertTextAtCursor(result.data, currentSelectionStart, currentSelectionEnd);
      }
    } catch (error) {
      console.error("Error improving pattern description:", error);
    } finally {
      setIsImproving(false);
      // Restore focus if textarea had it, otherwise leave it
      if (originalFocus === textareaRef.current) textareaRef.current?.focus();
    }
  }; // Keep handleImproveSelection

  const hasSelection = !!textareaRef.current && textareaRef.current.selectionStart !== textareaRef.current.selectionEnd;

  return ( // Keep existing structure
    <div className="flex flex-col gap-3 bg-card p-4 rounded-lg shadow-sm border">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">Regex Pattern Description:</label>
      </div>
        {/* Section Heading */}
        <div className="flex items-center justify-between">
      </div>

      {/* Explanatory Text */}
      <p className="text-sm text-muted-foreground -mt-2">
        Describe the types of files or content you want to find (e.g., &quot;React components using useState&quot;, &quot;Markdown files with TODOs&quot;). AI will generate corresponding regex patterns below.
      </p>

      <Textarea
        ref={textareaRef}
        value={value}
        onSelect={handleSelect}
        onChange={(e) => {
          const newValue = e.target.value;
          if (onChange) {
            onChange(newValue);
          }
          onInteraction(); // Notify parent
        }}
        placeholder="Enter your description here..."
        className="resize-y min-h-[120px] bg-background/80" // Kept original height
      />
      <Button
        type="button"
        size="sm"
        onClick={onGenerateRegex}
        disabled={isGenerating || !value.trim()} // Disable if generating or no text
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

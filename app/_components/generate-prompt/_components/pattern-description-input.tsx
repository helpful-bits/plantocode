"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { improvePatternDescriptionAction } from "@/actions/text-improvement-actions";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface PatternDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerateRegex: () => void;
  isGeneratingRegex: boolean;
  regexGenerationError: string;
  codebaseStructure?: string;
  foundFiles?: string[];
}

export default function PatternDescriptionInput({
  value,
  onChange,
  onGenerateRegex,
  isGeneratingRegex,
  regexGenerationError,
  codebaseStructure,
  foundFiles = [],
}: PatternDescriptionInputProps) {
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [selectionEnd, setSelectionEnd] = useState<number>(0);
  const [isImproving, setIsImproving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [canRevertVoice, setCanRevertVoice] = useState(false); // Renamed to avoid conflict

  const handleTranscribedText = useCallback((text: string) => {
    const currentText = textareaRef.current?.value || '';
    const updatedText = (currentText ? currentText + " " + text : text).trim();
    onChange(updatedText);
    setCanRevertVoice(false); // Once new text is added, revert is less meaningful unless specifically tracked
  }, [onChange]);

  const handleCorrectionComplete = useCallback(() => {
    setCanRevertVoice(true);
  }, []); // Empty dependency array for handleCorrectionComplete
  
  // Use environment variable to check if correction feature should be enabled
  const {
    isRecording,
    isProcessing: isProcessingAudio,
    error: voiceError,
    startRecording,
    stopRecording,
    revertToRaw,
    correctedText,
  } = useVoiceRecording({ 
    onTranscribed: handleTranscribedText,
    // Only pass onCorrectionComplete if the key exists, disabling correction otherwise
    onCorrectionComplete: handleCorrectionComplete,
    foundFiles
  });

  const handleToggleRecording = async () => {
    if (!isRecording) {
      await startRecording();
    } else {
      stopRecording();
    }
  };

  // Reset revert ability if the text area changes manually
  useEffect(() => {
    setCanRevertVoice(false);
  }, [value]);

  // Capture and store the selection positions whenever the user selects text
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setSelectionStart(e.currentTarget.selectionStart);
    setSelectionEnd(e.currentTarget.selectionEnd);
  };

  // Insert or replace text at the stored cursor or selection range
  const insertTextAtCursor = useCallback(
    (newText: string) => {
      if (!textareaRef.current) return;

      const textarea = textareaRef.current;
      textarea.focus();

      const originalText = textarea.value;
      textarea.setSelectionRange(selectionStart, selectionEnd);

      // Using execCommand for potential undo history, fallback if needed
      const event = new InputEvent('input', { inputType: 'insertText', data: newText, bubbles: true, cancelable: true });
      document.execCommand('insertText', false, newText);
      textarea.dispatchEvent(event);

      if (textarea.value === originalText) { // Fallback
        const before = textarea.value.slice(0, selectionStart);
        const after = textarea.value.slice(selectionEnd);
        textarea.value = before + newText + after;
        textarea.dispatchEvent(event); // Re-dispatch for consistency
      }

      onChange(textarea.value); // Update parent state

      const newPosition = selectionStart + newText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    },
    [selectionStart, selectionEnd, onChange]
  );

  const handleImproveSelection = async () => {
    if (selectionStart === selectionEnd) return;

    const selectedText = value?.slice(selectionStart, selectionEnd) || "";
    if (!selectedText.trim()) return;

    setIsImproving(true);
    try {
      const result = await improvePatternDescriptionAction(selectedText, codebaseStructure);
      if (result.isSuccess) {
        insertTextAtCursor(result.data);
      }
      // Reset selection after improving
      setSelectionStart(textareaRef.current?.selectionStart || 0);
      setSelectionEnd(textareaRef.current?.selectionStart || 0);
    } catch (error) {
      console.error("Error improving pattern description:", error);
    } finally {
      setIsImproving(false);
    }
  };

  const hasSelection = selectionStart !== selectionEnd;

  return (
    <div className="flex flex-col gap-3 bg-card p-5 rounded-lg shadow-sm border">
      <div className="flex items-center justify-between">
        <label className="font-semibold text-lg text-card-foreground flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Describe File Patterns
        </label>
        <Button
          variant="secondary" size="sm"
          onClick={handleImproveSelection}
          disabled={isImproving || !hasSelection}
          className="h-8 flex items-center gap-1"
        >
          {isImproving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Improving...</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Improve Selection</span>
            </>
          )}
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        Describe the types of files or content you want to find (e.g., "React components using useState", "Markdown files with TODOs"). AI will generate regex patterns.
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onSelect={handleSelect}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your description here..."
        className="resize-y min-h-[120px] bg-background/80"
      />
      <div className="flex justify-between items-start pt-1">
        <div className="flex flex-col gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleRecording}
            disabled={isProcessingAudio}
            className="min-w-[120px] flex justify-center items-center gap-2 h-9"
          >
            {isProcessingAudio ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : isRecording ? (
              <>
                <MicOff className="h-4 w-4 text-red-500" />
                <span>Stop Recording</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                <span>Record Description</span>
              </>
            )}
          </Button>
          {canRevertVoice && correctedText && (
            <Button
              variant="link"
              size="sm"
              onClick={() => { revertToRaw(); setCanRevertVoice(false); }}
              className="text-muted-foreground justify-start p-0 h-auto text-xs"
            >
              Revert to raw transcription
            </Button>
          )}
        </div>

        <Button
          size="sm"
          onClick={onGenerateRegex}
          disabled={isGeneratingRegex || isProcessingAudio}
          className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isGeneratingRegex ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Generating...</span>
            </>
          ) : (
            "Generate Regex"
          )}
        </Button>
      </div>
      {regexGenerationError && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded mt-1">{regexGenerationError}</div>
      )}
      {voiceError && (
        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded mt-1">{voiceError}</div>
      )}
    </div>
  );
}

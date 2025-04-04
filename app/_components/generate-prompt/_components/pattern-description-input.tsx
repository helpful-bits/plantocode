"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface PatternDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  onGenerateRegex: () => void;
  isGeneratingRegex: boolean;
  regexGenerationError: string;
}

export default function PatternDescriptionInput({
  value,
  onChange,
  onGenerateRegex,
  isGeneratingRegex,
  regexGenerationError,
}: PatternDescriptionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [canRevert, setCanRevert] = useState(false);

  const handleTranscribedText = useCallback((text: string) => {
    const currentText = textareaRef.current?.value || '';
    const updatedText = (currentText ? currentText + " " + text : text).trim();
    onChange(updatedText);
    setCanRevert(false); // Once new text is added, revert is less meaningful unless specifically tracked
  }, [onChange]);

  const handleCorrectionComplete = useCallback(() => {
    setCanRevert(true);
  }, []);
  
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
    onCorrectionComplete: handleCorrectionComplete 
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
    setCanRevert(false);
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <label className="font-bold text-foreground">Describe File Patterns:</label>
      <div className="text-sm text-muted-foreground">
        Describe the types of files or content you want to find (e.g., &quot;React components using useState&quot;, &quot;Markdown files with TODOs&quot;). AI will generate regex patterns.
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter your description here..."
        className="resize-none"
      />
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleRecording}
          disabled={isProcessingAudio}
          className="min-w-[120px] flex justify-center items-center gap-2"
        >
          {isProcessingAudio ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Processing...</span>
            </>
          ) : isRecording ? (
            <>
              <MicOff className="h-4 w-4" />
              <span>Stop Recording</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              <span>Start Recording</span>
            </>
          )}
        </Button>
        <Button
          size="sm"
          onClick={onGenerateRegex}
          disabled={isGeneratingRegex || isProcessingAudio}
        >
          Generate Regex
        </Button>
      </div>
      {regexGenerationError && <div className="text-sm text-destructive">{regexGenerationError}</div>}
      {voiceError && <div className="text-sm text-destructive">{voiceError}</div>}
      {canRevert && correctedText && (
        <Button
          variant="link"
          size="sm"
          onClick={() => { revertToRaw(); setCanRevert(false); }}
          className="text-muted-foreground justify-start p-0 h-auto"
        >
          Revert to raw transcription
        </Button>
      )}
    </div>
  );
}

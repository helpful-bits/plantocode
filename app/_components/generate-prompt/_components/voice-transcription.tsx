"use client";

import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";
import { useVoiceRecording } from "@/hooks/useVoiceRecording"; // Keep useVoiceRecording import
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProject } from "@/lib/contexts/project-context"; // Add useProject context
import { TaskDescriptionHandle } from "./task-description";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  onInteraction?: () => void; // Optional interaction handler
  textareaRef?: React.RefObject<TaskDescriptionHandle>;
}

export default function VoiceTranscription({
  onTranscribed,
  onInteraction,
  textareaRef,
}: VoiceTranscriptionProps) {
  const [showRevertOption, setShowRevertOption] = useState(false);
  const [languageCode, setLanguageCode] = useState('en');
  const { activeSessionId } = useProject(); // Get active session ID from project context
  
  const handleCorrectionComplete = useCallback((raw: string, corrected: string) => {
    // Only show revert if correction actually changed the text
    if (raw !== corrected) {
      setShowRevertOption(true);
    }
  }, []);

  // Create a wrapper for onTranscribed that inserts at cursor position if ref is available
  const handleTranscriptionComplete = useCallback((text: string) => {
    if (textareaRef?.current) {
      // Insert at cursor position if ref is available
      textareaRef.current.insertTextAtCursorPosition(text);
    } else {
      // Otherwise, call the original onTranscribed function
      onTranscribed(text);
    }
  }, [textareaRef, onTranscribed]);
  
  const {
    isRecording,
    isProcessing,
    error: voiceError, // Get error state
    rawText,
    startRecording, // Function to start recording
    stopRecording, // Function to stop recording
    revertToRaw, // Function to revert to raw transcription
    setLanguage, // Get the setLanguage function from the hook
  } = useVoiceRecording({
    onTranscribed: handleTranscriptionComplete, // Use our new wrapper function
    // Enable correction callback
    onCorrectionComplete: handleCorrectionComplete,
    // Pass the interaction handler
    onInteraction,
    languageCode, // Pass the current language code to the hook
    sessionId: activeSessionId // Pass the active session ID for background job tracking
  });

  const handleToggleRecording = async () => {
    if (!isRecording) { // Check if not currently recording
      await startRecording();
    } else {
      stopRecording();
    }
  };

  // Modified revert handler to use cursor position
  const handleRevertToRaw = () => {
    if (rawText) {
      if (textareaRef?.current) {
        textareaRef.current.insertTextAtCursorPosition(rawText);
      } else {
        revertToRaw();
      }
      
      if (onInteraction) {
        onInteraction(); // Reverting also counts as interaction
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 border rounded-lg p-4 bg-card shadow-sm">
      <label className="font-semibold text-card-foreground">Record Description:</label>
      <div className="flex gap-2 items-start">
        <div className="flex flex-col">
          <Button
            type="button" // Add type="button"
            onClick={handleToggleRecording}
            disabled={isProcessing}
            variant={isRecording ? "destructive" : "secondary"}
            size="sm"
            className="min-w-[120px] flex justify-center items-center gap-2"
          > {/* Keep button structure */}
            {isProcessing ? (
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
                <span>Record Audio</span>
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">Record your task description using your microphone. Transcription uses Groq (Whisper).</p>
        </div>
        <div className="flex flex-col">
          <div className="h-9">
            <Select value={languageCode} onValueChange={(value) => { setLanguageCode(value); setLanguage(value); }} disabled={isRecording || isProcessing}>
              <SelectTrigger className="w-[100px] h-9" aria-label="Select transcription language">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                {/* Add more languages as needed */}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Select the language you will be speaking.</p>
        </div>

        {showRevertOption && rawText && (
          <Button // Add type="button"
            type="button" // Keep button type
            onClick={handleRevertToRaw}
            variant="link"
            size="sm"
            className="text-muted-foreground justify-start p-0 h-auto text-xs" // Made text smaller
          >
            Revert to raw transcription
          </Button>
        )}
      </div>
      {voiceError && <div className="text-sm text-destructive mt-1">{voiceError}</div>}
    </div>
  );
}

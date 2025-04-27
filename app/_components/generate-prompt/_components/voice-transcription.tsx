"use client";

import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";
import { useVoiceRecording } from "@/hooks/useVoiceRecording"; // Keep useVoiceRecording import
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProject } from "@/lib/contexts/project-context"; // Add useProject context

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  onInteraction?: () => void; // Optional interaction handler
}

export default function VoiceTranscription({
  onTranscribed,
  onInteraction,
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
    onTranscribed, // Pass the callback prop
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

  return (
    <div className="flex flex-col gap-2 border rounded-lg p-4 bg-card shadow-sm">
      <label className="font-semibold text-card-foreground">Record Description:</label>
      <div className="flex gap-2 items-center">
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
        <p className="text-xs text-muted-foreground mt-1">Select the language you will be speaking.</p>

        {showRevertOption && rawText && (
          <Button // Add type="button"
            type="button" // Keep button type
            onClick={() => {
              revertToRaw();
              onInteraction(); // Reverting also counts as interaction
            }}
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

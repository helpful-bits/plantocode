"use client";
 
import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react"; // Keep imports
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  onInteraction?: () => void; // Optional interaction handler
}

export default function VoiceTranscription({
  onTranscribed,
  onInteraction,
}: VoiceTranscriptionProps) {
  const [showRevertOption, setShowRevertOption] = useState(false); // State for revert button visibility
  const [languageCode, setLanguageCode] = useState('en'); // Default to English


  const handleCorrectionComplete = useCallback((raw: string, corrected: string) => {
    if (raw !== corrected) {
      setShowRevertOption(true);
    }
  }, []);
  const {
    isRecording,
    isProcessing,
    error: voiceError,
    rawText,
    startRecording, // Function to start recording
    stopRecording, // Corrected property name
    revertToRaw,
    setLanguage, // Get the setLanguage function from the hook
  } = useVoiceRecording({
    onTranscribed, // Pass the callback prop
    // Always enable correction callback
    onCorrectionComplete: handleCorrectionComplete,
    // Pass the interaction handler
    onInteraction,
    languageCode // Pass the current language code to the hook
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
      <label className="font-semibold text-card-foreground">Record Task Description</label>
      <div className="flex gap-2 items-center">
        <Button
          type="button" // Add type="button"
          onClick={handleToggleRecording}
          disabled={isProcessing}
          variant={isRecording ? "destructive" : "secondary"}
          size="sm"
          className="min-w-[120px] flex justify-center items-center gap-2"
        >
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

        {showRevertOption && rawText && (
          <Button // Add type="button"
            type="button"
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

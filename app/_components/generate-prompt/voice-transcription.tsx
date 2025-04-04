"use client";

import { Button } from "@/components/ui/button";
import { useState, useCallback } from "react";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  foundFiles: string[];
}

export default function VoiceTranscription({ onTranscribed, foundFiles }: VoiceTranscriptionProps) {
  const [showRevertOption, setShowRevertOption] = useState(false);

  // Check if correction API key is available
  const correctionEnabled = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY_EXISTS === 'true';

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
    startRecording,
    stopRecording,
    revertToRaw
  } = useVoiceRecording({
    onTranscribed,
    // Only enable correction callback if API key exists
    onCorrectionComplete: correctionEnabled ? handleCorrectionComplete : undefined,
    foundFiles
  });

  const handleToggleRecording = async () => {
    if (!isRecording) {
      await startRecording();
    } else {
      stopRecording();
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <Button
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

        {correctionEnabled && showRevertOption && rawText && (
          <Button
            onClick={() => { revertToRaw(); setShowRevertOption(false); }}
            variant="link"
            size="sm"
            className="text-muted-foreground justify-start p-0 h-auto"
          >
            Revert to raw transcription
          </Button>
        )}
      </div>
      {voiceError && <div className="text-sm text-destructive mt-1">{voiceError}</div>}
    </div>
  );
} 
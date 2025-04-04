"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { transcribeVoiceAction } from "@/actions/voice-transcription-actions";
import { correctTaskDescriptionAction } from "@/actions/voice-correction-actions";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  foundFiles: string[];
}

export default function VoiceTranscription({ onTranscribed, foundFiles }: VoiceTranscriptionProps) {
  const [showRevertOption, setShowRevertOption] = useState(false);
  
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
    onCorrectionComplete: (raw, corrected) => {
      if (raw !== corrected) {
        setShowRevertOption(true);
      }
    },
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
        >
          {isProcessing ? "Processing..." : isRecording ? "Stop Recording" : "Record Audio"}
        </Button>

        {showRevertOption && rawText && (
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
      {voiceError && <div className="text-sm text-destructive">{voiceError}</div>}
    </div>
  );
} 
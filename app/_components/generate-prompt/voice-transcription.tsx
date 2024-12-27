"use client";

import { useState, useCallback, useEffect } from "react";
import { transcribeVoiceAction } from "@/actions/voice-transcription-actions";
import { correctTaskDescriptionAction } from "@/actions/voice-correction-actions";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  foundFiles: string[];
}

export default function VoiceTranscription({ onTranscribed, foundFiles }: VoiceTranscriptionProps) {
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [rawText, setRawText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRevertOption, setShowRevertOption] = useState(false);

  const stopRecording = useCallback(async () => {
    try {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }
      setMediaRecorder(null);
      setIsRecording(false);
    } catch (err) {
      console.error("Error stopping recording:", err);
    }
  }, [mediaStream]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      
      recorder.ondataavailable = async (event) => {
        try {
          if (event.data.size > 0) {
            setIsProcessing(true);
            const response = await transcribeVoiceAction({
              blob: event.data,
              mimeType: "audio/webm",
            });

            if (!response.isSuccess) {
              throw new Error(response.message);
            }
            
            setRawText(response.data);
            
            // Automatically correct the text
            const correctionResult = await correctTaskDescriptionAction(response.data, foundFiles);
            if (correctionResult.isSuccess) {
              onTranscribed(correctionResult.data);
              setShowRevertOption(true);
            } else {
              // If correction fails, use raw text
              onTranscribed(response.data);
            }
          }
        } catch (err) {
          console.error("Error processing recording:", err);
          alert(err instanceof Error ? err.message : "Failed to process audio");
        } finally {
          await stopRecording();
          setIsProcessing(false);
        }
      };

      setMediaRecorder(recorder);
      setIsRecording(true);
      recorder.start();
    } catch (err) {
      console.error("Recording failed:", err);
      alert(err instanceof Error ? err.message : "Failed to start recording");
      await stopRecording();
    }
  }

  function revertToRaw() {
    onTranscribed(rawText);
    setShowRevertOption(false);
  }

  const handleToggleRecording = async () => {
    if (!isRecording) {
      await startRecording();
    } else if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  };

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleToggleRecording}
        disabled={isProcessing}
        className={`bg-secondary text-secondary-foreground p-2 mt-2 rounded text-sm hover:bg-secondary/90 transition-colors ${
          isRecording ? "bg-red-500" : ""
        } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {isProcessing ? "Processing..." : isRecording ? "Stop Recording" : "Record Audio"}
      </button>

      {showRevertOption && (
        <button
          onClick={revertToRaw}
          className="bg-destructive text-destructive-foreground p-2 rounded text-sm self-start"
        >
          Revert to Original Text
        </button>
      )}
    </div>
  );
} 
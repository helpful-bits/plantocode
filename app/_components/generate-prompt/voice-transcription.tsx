"use client";

import { useState, useCallback, useEffect } from "react";
import { transcribeVoiceAction } from "@/actions/voice-transcription-actions";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
}

export default function VoiceTranscription({ onTranscribed }: VoiceTranscriptionProps) {
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);

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
            const response = await transcribeVoiceAction({
              blob: event.data,
              mimeType: "audio/webm",
            });

            if (!response.isSuccess) {
              throw new Error(response.message);
            }
            onTranscribed(response.data);
          }
        } catch (err) {
          console.error("Error processing recording:", err);
          alert(err instanceof Error ? err.message : "Failed to process audio");
        } finally {
          await stopRecording();
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

  const handleToggleRecording = async () => {
    if (!isRecording) {
      await startRecording();
    } else if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return (
    <button
      onClick={handleToggleRecording}
      className={`bg-secondary text-secondary-foreground p-2 mt-2 rounded text-sm hover:bg-secondary/90 transition-colors ${
        isRecording ? "bg-red-500" : ""
      }`}
    >
      {isRecording ? "Stop Recording" : "Record Audio"}
    </button>
  );
} 
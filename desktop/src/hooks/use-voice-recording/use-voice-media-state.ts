"use client";

import { useState, useRef, useCallback } from "react";

import { setupMedia, cleanupMedia } from "./voice-media-handler";
import { getErrorMessage } from "@/utils/error-handling";

const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface UseVoiceMediaStateProps {
  onError: (error: string) => void;
  selectedAudioInputId: string;
}

export function useVoiceMediaState({
  onError,
  selectedAudioInputId,
}: UseVoiceMediaStateProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const lastRecordingRef = useRef<{ blob: Blob; durationMs: number } | null>(null);

  const [activeAudioInputLabel, setActiveAudioInputLabel] = useState<
    string | null
  >(null);

  const startMediaRecording = useCallback(async (onComplete: (blob: Blob) => void) => {
    audioChunksRef.current = [];

    const media = await setupMedia({
      onDataAvailable: (chunk) => {
        audioChunksRef.current.push(chunk);
      },
      onError,
      onStop: () => {
        // Combine all chunks into single blob when recording stops
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mimeTypeRef.current,
          });
          onComplete(audioBlob);
        }
      },
      deviceId: selectedAudioInputId,
    });

    if (!media) {
      return null;
    }

    streamRef.current = media.stream;
    recorderRef.current = media.recorder;
    mimeTypeRef.current = media.mimeType;

    if (media.activeDeviceLabel) {
      setActiveAudioInputLabel(media.activeDeviceLabel);
    }

    // Start recording without timeslice for single continuous recording
    recorderRef.current.start();

    // Auto-stop after maximum duration
    autoStopTimeoutRef.current = setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
    }, MAX_RECORDING_DURATION_MS);

    return media;
  }, [selectedAudioInputId, onError]);

  const stopMediaRecording = useCallback(async (): Promise<void> => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      return;
    }

    try {
      // Clear auto-stop timeout if recording is stopped manually
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }

      if (recorderRef.current && recorderRef.current.state === "recording") {
        recorderRef.current.stop();
      }
    } catch (err) {
      console.error("[VoiceRecording] Error in stopMediaRecording:", err);
      onError(`Failed to stop recording: ${getErrorMessage(err)}`);
    } finally {
      cleanupMedia(recorderRef.current, streamRef.current);
      recorderRef.current = null;
      streamRef.current = null;
    }
  }, [onError]);

  const resetMediaState = useCallback(() => {
    // Clear any pending timeout
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }

    cleanupMedia(recorderRef.current, streamRef.current);
    recorderRef.current = null;
    streamRef.current = null;

    setActiveAudioInputLabel(null);
    audioChunksRef.current = [];
  }, []);

  return {
    recorderRef,
    streamRef,
    audioChunksRef,
    lastRecordingRef,
    activeAudioInputLabel,
    startMediaRecording,
    stopMediaRecording,
    resetMediaState,
  };
}

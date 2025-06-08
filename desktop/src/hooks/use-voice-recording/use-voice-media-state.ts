"use client";

import { useState, useRef, useCallback } from "react";

import { setupMedia, cleanupMedia } from "./voice-media-handler";
import { getErrorMessage } from "@/utils/error-handling";

const MEDIA_RECORDER_TIMESLICE_MS = 10000;
const MEDIA_RECORDER_REQUEST_DATA_INTERVAL_MS = 3000;

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

  const lastRecordingRef = useRef<{ blob: Blob; durationMs: number } | null>(null);

  const [activeAudioInputLabel, setActiveAudioInputLabel] = useState<
    string | null
  >(null);

  const startMediaRecording = useCallback(async (onDataAvailable: (chunk: Blob) => void) => {
    audioChunksRef.current = [];

    const media = await setupMedia({
      onDataAvailable: (chunk) => {
        audioChunksRef.current.push(chunk);
        onDataAvailable(chunk);
      },
      onError,
      onStop: () => {},
      deviceId: selectedAudioInputId,
    });

    if (!media) {
      return null;
    }

    streamRef.current = media.stream;
    recorderRef.current = media.recorder;

    if (media.activeDeviceLabel) {
      setActiveAudioInputLabel(media.activeDeviceLabel);
    }

    recorderRef.current.start(MEDIA_RECORDER_TIMESLICE_MS);

    const interval = setInterval(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try {
          recorderRef.current.requestData();
        } catch (err) {
          console.warn("[VoiceRecording] Error requesting data:", err);
        }
      } else {
        clearInterval(interval);
      }
    }, MEDIA_RECORDER_REQUEST_DATA_INTERVAL_MS);

    const intervalId = interval as unknown as number;

    const originalStop = recorderRef.current.onstop;
    recorderRef.current.onstop = (ev) => {
      clearInterval(intervalId);
      if (originalStop && recorderRef.current)
        originalStop.call(recorderRef.current, ev);
    };

    return media;
  }, [selectedAudioInputId, onError]);

  const stopMediaRecording = useCallback(async (): Promise<void> => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      return;
    }

    try {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try {
          recorderRef.current.requestData();

          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (err) {
          console.warn("[VoiceRecording] Error in final requestData:", err);
        }
      }

      recorderRef.current.stop();


      if (audioChunksRef.current.length > 0) {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        lastRecordingRef.current = { blob: audioBlob, durationMs: Date.now() };
      } else {
        console.warn("[VoiceRecording] No audio chunks captured during recording");
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

"use client";

import { useState, useRef, useCallback } from "react";

import { setupMedia, cleanupMedia } from "./voice-media-handler";
import { getErrorMessage } from "@/utils/error-handling";

const MEDIA_RECORDER_TIMESLICE_MS = 5000;
const MEDIA_RECORDER_REQUEST_DATA_INTERVAL_MS = 5000;

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
  const dataRequestIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // Clear any existing interval first
    if (dataRequestIntervalRef.current !== null) {
      clearInterval(dataRequestIntervalRef.current);
      dataRequestIntervalRef.current = null;
    }

    const interval = setInterval(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try {
          recorderRef.current.requestData();
        } catch (err) {
          console.warn("[VoiceRecording] Error requesting data:", err);
        }
      } else {
        // Recording stopped, clean up interval
        if (dataRequestIntervalRef.current !== null) {
          clearInterval(dataRequestIntervalRef.current);
          dataRequestIntervalRef.current = null;
        }
      }
    }, MEDIA_RECORDER_REQUEST_DATA_INTERVAL_MS);

    dataRequestIntervalRef.current = interval;

    const originalStop = recorderRef.current.onstop;
    recorderRef.current.onstop = (ev) => {
      // Clean up interval when recording stops
      if (dataRequestIntervalRef.current !== null) {
        clearInterval(dataRequestIntervalRef.current);
        dataRequestIntervalRef.current = null;
      }
      
      if (originalStop && recorderRef.current) {
        originalStop.call(recorderRef.current, ev);
      }
    };

    return media;
  }, [selectedAudioInputId, onError]);

  const stopMediaRecording = useCallback(async (): Promise<void> => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      return;
    }

    try {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        // Simply request final data - MediaRecorder will handle it asynchronously
        // No need for complex timeout logic that may interfere with natural flow
        recorderRef.current.requestData();
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
    // Clean up interval first
    if (dataRequestIntervalRef.current !== null) {
      clearInterval(dataRequestIntervalRef.current);
      dataRequestIntervalRef.current = null;
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

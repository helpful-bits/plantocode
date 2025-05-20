"use client";

import { useState, useCallback } from "react";

import { useAudioInputDevices } from "./use-audio-input-devices";
import { useVoiceMediaState } from "./use-voice-media-state";
import { useVoiceTranscriptionProcessing } from "./use-voice-transcription-processing";

interface UseVoiceRecordingProps {
  sessionId?: string | null;
  language?: string;
  languageCode?: string;
  autoCorrect?: boolean;
  onStateChange?: (state: {
    isRecording: boolean;
    isProcessing: boolean;
    error: string | null;
  }) => void;
  onTranscribed?: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void;
  onInteraction?: () => void;
  projectDirectory?: string;
}

interface UseVoiceRecordingResult {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  rawText: string | null;
  correctedText: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  reset: () => void;
  retryLastRecording: () => Promise<void>;
  textStatus?: "loading" | "done" | "error";
  availableAudioInputs: MediaDeviceInfo[];
  selectedAudioInputId: string;
  activeAudioInputLabel: string | null;
  selectAudioInput: (deviceId: string) => void;
}

export function useVoiceRecording({
  sessionId = null,
  language: _language = "en",
  autoCorrect = true,
  onStateChange,
  onTranscribed,
  onCorrectionComplete,
  projectDirectory = "",
}: UseVoiceRecordingProps = {}): UseVoiceRecordingResult {
  // Top-level state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Updates the state and calls the onStateChange callback
  const updateState = useCallback(
    (
      newState: Partial<{
        isRecording: boolean;
        isProcessing: boolean;
        error: string | null;
      }>
    ) => {
      // Update local state
      if (newState.isRecording !== undefined)
        setIsRecording(newState.isRecording);
      if (newState.isProcessing !== undefined)
        setIsProcessing(newState.isProcessing);
      if (newState.error !== undefined) setError(newState.error);

      // Call onStateChange with the full updated state
      onStateChange?.({
        isRecording: newState.isRecording ?? isRecording,
        isProcessing: newState.isProcessing ?? isProcessing,
        error: newState.error ?? error,
      });
    },
    [isRecording, isProcessing, error, onStateChange]
  );

  // Use the specialized hooks
  const {
    availableAudioInputs,
    selectedAudioInputId,
    selectAudioInput,
    refreshDeviceList,
  } = useAudioInputDevices();

  // Ensure error propagation to main hook
  const handleError = useCallback(
    (errorMessage: string) => {
      updateState({ error: errorMessage });
    },
    [updateState]
  );

  const {
    activeAudioInputLabel,
    lastAudioBlobRef,
    startMediaRecording,
    stopMediaRecording,
    resetMediaState,
  } = useVoiceMediaState({
    onError: handleError,
    selectedAudioInputId,
  });

  const {
    rawText,
    correctedText,
    textStatus,
    processTranscription,
    retryTranscription,
    resetTranscriptionState,
  } = useVoiceTranscriptionProcessing({
    sessionId,
    projectDirectory,
    autoCorrect,
    onTranscribed,
    onCorrectionComplete,
    onError: handleError,
    setIsProcessing: (value) => updateState({ isProcessing: value }),
  });

  // Start recording
  const startRecording = useCallback(async () => {
    // Reset error state
    updateState({ error: null });

    // Reset previous recording data
    resetTranscriptionState();

    // Start media recording
    const media = await startMediaRecording();

    if (media) {
      updateState({ isRecording: true });

      // After successful media setup, refresh device list to ensure labels are populated
      await refreshDeviceList();
    }
  }, [
    updateState,
    startMediaRecording,
    resetTranscriptionState,
    refreshDeviceList,
  ]);

  // Stop recording and process audio
  const stopRecording = useCallback(async () => {
    updateState({ isRecording: false, isProcessing: true });

    // Stop media recording and get the audio blob
    const audioBlob = await stopMediaRecording();

    if (audioBlob) {
      // Process the transcription
      await processTranscription(audioBlob);
    } else {
      // If no audio blob was captured, end processing
      updateState({ isProcessing: false });
    }
  }, [updateState, stopMediaRecording, processTranscription]);

  // Reset the recording state
  const reset = useCallback(() => {
    // Clean up any existing media
    resetMediaState();

    // Clear all transcription state
    resetTranscriptionState();

    // Reset top-level state
    setIsRecording(false);
    setIsProcessing(false);
    setError(null);
  }, [resetMediaState, resetTranscriptionState]);

  // Function to retry the last recording
  const retryLastRecording = useCallback(async () => {
    // Check if we have a stored audio blob
    if (!lastAudioBlobRef.current) {
      console.error(
        "[VoiceRecording] No previous recording available to retry"
      );
      updateState({ error: "No previous recording available to retry" });
      return;
    }

    // Set processing state
    updateState({ isProcessing: true, error: null });

    // Retry transcription with the saved blob
    await retryTranscription(lastAudioBlobRef.current);
  }, [updateState, retryTranscription, lastAudioBlobRef]);

  // Function to select audio input that prevents changes during active recording
  const handleSelectAudioInput = useCallback(
    (deviceId: string) => {
      // Don't allow changing device while recording or processing
      if (isRecording || isProcessing) {
        console.warn(
          "[VoiceRecording] Cannot change audio input while recording or processing"
        );
        return;
      }

      selectAudioInput(deviceId);
    },
    [isRecording, isProcessing, selectAudioInput]
  );

  return {
    isRecording,
    isProcessing,
    error,
    rawText,
    correctedText,
    startRecording,
    stopRecording,
    reset,
    retryLastRecording,
    textStatus,
    availableAudioInputs,
    selectedAudioInputId,
    activeAudioInputLabel,
    selectAudioInput: handleSelectAudioInput,
  };
}

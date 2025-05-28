"use client";

import { useState, useCallback, useRef, useEffect } from "react";

import { useAudioInputDevices } from "./use-audio-input-devices";
import { useVoiceMediaState } from "./use-voice-media-state";
import { useVoiceTranscriptionProcessing } from "./use-voice-transcription-processing";

interface UseVoiceRecordingProps {
  sessionId?: string | null;
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
  projectDirectory?: string | null;
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
  requestPermissionAndRefreshDevices: () => Promise<boolean>;
  textStatus?: "loading" | "done" | "error";
  availableAudioInputs: MediaDeviceInfo[];
  selectedAudioInputId: string;
  activeAudioInputLabel: string | null;
  selectAudioInput: (deviceId: string) => void;
}

export function useVoiceRecording({
  sessionId = null,
  autoCorrect = true,
  onStateChange,
  onTranscribed,
  onCorrectionComplete,
  projectDirectory = null,
}: UseVoiceRecordingProps = {}): UseVoiceRecordingResult {
  // Top-level state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Create ref for onStateChange to maintain stable callback
  const onStateChangeRef = useRef(onStateChange);

  // Update the ref when onStateChange changes
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  // Create refs to hold the latest values of state variables
  const isRecordingRef = useRef(isRecording);
  const isProcessingRef = useRef(isProcessing);
  const errorRef = useRef(error);
  
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { errorRef.current = error; }, [error]);

  // Updates the state and calls the onStateChange callback
  const updateState = useCallback(
    (newStateUpdates: Partial<{ isRecording: boolean; isProcessing: boolean; error: string | null }>) => {
      // Store which states are being updated in this specific call
      const stateKeysUpdatedInThisCall: (keyof typeof newStateUpdates)[] = [];

      if (newStateUpdates.isRecording !== undefined) {
        setIsRecording(newStateUpdates.isRecording);
        stateKeysUpdatedInThisCall.push('isRecording');
      }
      if (newStateUpdates.isProcessing !== undefined) {
        setIsProcessing(newStateUpdates.isProcessing);
        stateKeysUpdatedInThisCall.push('isProcessing');
      }
      // Use Object.prototype.hasOwnProperty.call to correctly check if 'error' key is present,
      // even if its value is null.
      if (Object.prototype.hasOwnProperty.call(newStateUpdates, 'error')) {
        setError(newStateUpdates.error!); // Assert non-null as we checked presence
        stateKeysUpdatedInThisCall.push('error');
      }
      
      // Construct the state for the onStateChangeRef callback.
      // For fields updated in this call, use their new values.
      // For fields not updated in this call, use the latest values from refs.
      const callbackState = {
        isRecording: stateKeysUpdatedInThisCall.includes('isRecording') ? newStateUpdates.isRecording! : isRecordingRef.current,
        isProcessing: stateKeysUpdatedInThisCall.includes('isProcessing') ? newStateUpdates.isProcessing! : isProcessingRef.current,
        error: stateKeysUpdatedInThisCall.includes('error') ? newStateUpdates.error! : errorRef.current,
      };
      onStateChangeRef.current?.(callbackState);
    },
    [onStateChangeRef] // Depends only on the stable ref now. Setters are stable.
  );

  // Use the specialized hooks
  const {
    availableAudioInputs,
    selectedAudioInputId,
    selectAudioInput,
    refreshDeviceList,
    requestPermissionAndRefreshDevices,
  } = useAudioInputDevices();

  // Create a stable error handler to avoid circular dependencies
  const updateStateRef = useRef(updateState);
  useEffect(() => {
    updateStateRef.current = updateState;
  }, [updateState]);

  // Ensure error propagation to main hook
  const handleError = useCallback(
    (errorMessage: string) => {
      updateStateRef.current({ error: errorMessage, isProcessing: false });
    },
    []
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
    try {
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
      } else {
        // If startMediaRecording returns null, ensure recording state is false
        // Error should already be handled by handleError callback from startMediaRecording
        updateState({ isRecording: false });
      }
    } catch (error) {
      // Catch any unhandled errors in startRecording
      console.error("[VoiceRecording] Unexpected error in startRecording:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateState({ 
        error: `Failed to start recording: ${errorMessage}`,
        isRecording: false 
      });
    }
  }, [
    updateState,
    startMediaRecording,
    resetTranscriptionState,
    refreshDeviceList,
  ]);

  // Stop recording and process audio
  const stopRecording = useCallback(async () => {
    try {
      updateState({ isRecording: false, isProcessing: true });

      // Stop media recording and get the audio blob
      const audioBlob = await stopMediaRecording();

      if (audioBlob) {
        // Process the transcription - errors here are handled by processTranscription
        await processTranscription(audioBlob);
      } else {
        // If no audio blob was captured, end processing
        // Error should already be handled by handleError callback from stopMediaRecording
        updateState({ isProcessing: false });
      }
    } catch (error) {
      // Catch any unhandled errors in stopRecording or processTranscription
      console.error("[VoiceRecording] Unexpected error in stopRecording:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateState({ 
        error: `Failed to stop recording: ${errorMessage}`,
        isProcessing: false 
      });
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
    try {
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

      // Retry transcription with the saved blob - errors handled by retryTranscription
      await retryTranscription(lastAudioBlobRef.current);
    } catch (error) {
      // Catch any unhandled errors in retryLastRecording
      console.error("[VoiceRecording] Unexpected error in retryLastRecording:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateState({ 
        error: `Failed to retry recording: ${errorMessage}`,
        isProcessing: false 
      });
    }
  }, [updateState, retryTranscription]);

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
    requestPermissionAndRefreshDevices,
    textStatus,
    availableAudioInputs,
    selectedAudioInputId,
    activeAudioInputLabel,
    selectAudioInput: handleSelectAudioInput,
  };
}

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
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  const isRecordingRef = useRef(isRecording);
  const isProcessingRef = useRef(isProcessing);
  const errorRef = useRef(error);
  
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { isProcessingRef.current = isProcessing; }, [isProcessing]);
  useEffect(() => { errorRef.current = error; }, [error]);

  const updateState = useCallback(
    (newStateUpdates: Partial<{ isRecording: boolean; isProcessing: boolean; error: string | null }>) => {
      const stateKeysUpdatedInThisCall: (keyof typeof newStateUpdates)[] = [];

      if (newStateUpdates.isRecording !== undefined) {
        setIsRecording(newStateUpdates.isRecording);
        stateKeysUpdatedInThisCall.push('isRecording');
      }
      if (newStateUpdates.isProcessing !== undefined) {
        setIsProcessing(newStateUpdates.isProcessing);
        stateKeysUpdatedInThisCall.push('isProcessing');
      }
      if (Object.prototype.hasOwnProperty.call(newStateUpdates, 'error')) {
        setError(newStateUpdates.error!);
        stateKeysUpdatedInThisCall.push('error');
      }
      
      const callbackState = {
        isRecording: stateKeysUpdatedInThisCall.includes('isRecording') ? newStateUpdates.isRecording! : isRecordingRef.current,
        isProcessing: stateKeysUpdatedInThisCall.includes('isProcessing') ? newStateUpdates.isProcessing! : isProcessingRef.current,
        error: stateKeysUpdatedInThisCall.includes('error') ? newStateUpdates.error! : errorRef.current,
      };
      onStateChangeRef.current?.(callbackState);
    },
    [onStateChangeRef]
  );

  const {
    availableAudioInputs,
    selectedAudioInputId,
    selectAudioInput,
    refreshDeviceList,
    requestPermissionAndRefreshDevices,
  } = useAudioInputDevices();

  const updateStateRef = useRef(updateState);
  useEffect(() => {
    updateStateRef.current = updateState;
  }, [updateState]);

  const handleError = useCallback(
    (errorMessage: string) => {
      updateStateRef.current({ error: errorMessage, isProcessing: false });
    },
    []
  );

  const {
    activeAudioInputLabel,
    lastRecordingRef,
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
    startTranscriptionStream,
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

  const recordingStartTimeRef = useRef<number | null>(null);
  
  const writableStreamRef = useRef<WritableStream<Uint8Array> | null>(null);
  const resultPromiseRef = useRef<Promise<void> | null>(null);

  const startRecording = useCallback(async () => {
    try {
      updateState({ error: null });

      resetTranscriptionState();

      const { writableStream, resultPromise } = startTranscriptionStream();
      writableStreamRef.current = writableStream;
      resultPromiseRef.current = resultPromise;
      
      const writer = writableStream.getWriter();
      
      recordingStartTimeRef.current = Date.now();
      const media = await startMediaRecording(async (chunk: Blob) => {
        try {
          const arrayBuffer = await chunk.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          await writer.write(uint8Array);
        } catch (error) {
          console.error("[VoiceRecording] Error streaming chunk:", error);
        }
      });

      if (media) {
        updateState({ isRecording: true });

        await refreshDeviceList();
      } else {
        await writer.close();
        writableStreamRef.current = null;
        resultPromiseRef.current = null;
        updateState({ isRecording: false });
      }
    } catch (error) {
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
    startTranscriptionStream,
  ]);

  const stopRecording = useCallback(async () => {
    try {
      updateState({ isRecording: false, isProcessing: true });

      await stopMediaRecording();
      
      if (writableStreamRef.current) {
        const writer = writableStreamRef.current.getWriter();
        await writer.close();
        writableStreamRef.current = null;
      }
      
      if (resultPromiseRef.current) {
        await resultPromiseRef.current;
        resultPromiseRef.current = null;
      }
      
      updateState({ isProcessing: false });
    } catch (error) {
      console.error("[VoiceRecording] Unexpected error in stopRecording:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateState({ 
        error: `Failed to stop recording: ${errorMessage}`,
        isProcessing: false 
      });
    }
  }, [updateState, stopMediaRecording]);

  const reset = useCallback(() => {
    resetMediaState();

    resetTranscriptionState();

    setIsRecording(false);
    setIsProcessing(false);
    setError(null);
  }, [resetMediaState, resetTranscriptionState]);

  const retryLastRecording = useCallback(async () => {
    try {
      if (!lastRecordingRef.current) {
        console.error(
          "[VoiceRecording] No previous recording available to retry"
        );
        updateState({ error: "No previous recording available to retry" });
        return;
      }

      updateState({ isProcessing: true, error: null });

      const { writableStream, resultPromise } = await retryTranscription();
      writableStreamRef.current = writableStream;
      resultPromiseRef.current = resultPromise;
      
      const writer = writableStream.getWriter();
      const arrayBuffer = await lastRecordingRef.current.blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      await writer.write(uint8Array);
      await writer.close();
      
      await resultPromise;
      
      writableStreamRef.current = null;
      resultPromiseRef.current = null;
      updateState({ isProcessing: false });
    } catch (error) {
      console.error("[VoiceRecording] Unexpected error in retryLastRecording:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateState({ 
        error: `Failed to retry recording: ${errorMessage}`,
        isProcessing: false 
      });
    }
  }, [updateState, retryTranscription]);

  const handleSelectAudioInput = useCallback(
    (deviceId: string) => {
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

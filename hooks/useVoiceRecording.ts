"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { transcribeVoiceAction } from '@/actions/voice-transcription-actions';
import { correctTaskDescriptionAction } from '@/actions/voice-correction-actions';
import { ActionState } from '@/types';

interface UseVoiceRecordingProps {
  onTranscribed: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void; // Optional callback after correction
  foundFiles?: string[]; // Optional context for correction
  mimeType?: string;
}

interface VoiceRecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  rawText: string | null;
  correctedText: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  revertToRaw: () => void;
}

export function useVoiceRecording({
  onTranscribed,
  onCorrectionComplete,
  foundFiles = [],
  mimeType = 'audio/webm;codecs=opus',
}: UseVoiceRecordingProps): VoiceRecordingState {
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null); // Use ref to manage stream lifecycle
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);

  const cleanupMedia = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      // Attempt to stop only if needed, avoid errors if already stopped
      try { mediaRecorder.stop(); } catch {}
    }
    setMediaRecorder(null);
  }, [mediaRecorder]);

  const handleTranscription = useCallback(async (blob: Blob): Promise<ActionState<string>> => {
    return await transcribeVoiceAction({ blob, mimeType });
  }, [mimeType]);

  const handleCorrection = useCallback(async (text: string): Promise<ActionState<string>> => {
     // Only attempt correction if an API key is likely present and text is not empty
     const apiKeyExists = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY_EXISTS === 'true';
     if (apiKeyExists && text.trim()) {
         return await correctTaskDescriptionAction(text, foundFiles);
     } else {
        // Skip correction if no key or empty text
        return { isSuccess: true, data: text, message: "Correction skipped." };
     }
  }, [foundFiles]);

  const processAudio = useCallback(async (event: BlobEvent) => {
      if (event.data.size === 0) return;
      console.log("Processing audio blob:", event.data.size, event.data.type);

      setError(null);
      setIsProcessing(true);
      setRawText(null);
      setCorrectedText(null);

      let currentRawText = ""; // Store raw text locally in case correction fails
      try {
        const transcriptionResult = await handleTranscription(event.data);
        console.log("Transcription result:", transcriptionResult);
        if (!transcriptionResult.isSuccess || typeof transcriptionResult.data !== 'string') {
          throw new Error(transcriptionResult.message || 'Transcription failed');
        }
        currentRawText = transcriptionResult.data;
        setRawText(currentRawText);
        console.log("Raw text:", currentRawText);

        const correctionResult = await handleCorrection(currentRawText);
        console.log("Correction result:", correctionResult);
        const finalText = correctionResult.isSuccess ? correctionResult.data : currentRawText;

        setCorrectedText(finalText);
        console.log("Final text:", finalText);
        onTranscribed(finalText);
        if (onCorrectionComplete && correctionResult.isSuccess && finalText !== currentRawText) {
            onCorrectionComplete(currentRawText, finalText);
        }

      } catch (err) {
        // Log error before setting state to ensure it's captured
        console.error("Error in processAudio:", err);
        console.error("Error processing audio:", err);
        const message = err instanceof Error ? err.message : "Failed to process audio";
        setError(message);
        // Fallback to raw text if transcription succeeded but correction failed or error occurred
        if (currentRawText) onTranscribed(currentRawText);
      } finally {
        setIsProcessing(false);
        cleanupMedia(); // Stop stream tracks after processing
        setIsRecording(false); // Ensure recording state is reset
      }
  }, [handleTranscription, handleCorrection, onTranscribed, cleanupMedia, onCorrectionComplete, setRawText, setCorrectedText, setError, setIsProcessing]); // Added state setters used inside


  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) return;

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream; // Store stream in ref

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = processAudio;

      recorder.onerror = (event) => {
          console.error("MediaRecorder error:", event);
          setError("Recording error occurred.");
          cleanupMedia();
          setIsRecording(false);
          setIsProcessing(false);
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      const message = err instanceof Error ? err.message : 'Could not start recording. Check microphone permissions.';
      setError(message);
      cleanupMedia(); // Clean up if start fails
      setIsRecording(false);
    }
  }, [isRecording, isProcessing, mimeType, processAudio, cleanupMedia]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      // Processing happens in ondataavailable
    }
    // Do not call cleanupMedia here, let ondataavailable handle it after processing
    setIsRecording(false); // Set recording state immediately
  }, [mediaRecorder]);

  const revertToRaw = useCallback(() => {
    if (rawText !== null) {
      onTranscribed(rawText);
    }
  }, [rawText, onTranscribed]);

  // Cleanup effect when the component using this hook unmounts
  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, [cleanupMedia]);

  return {
    isRecording,
    isProcessing,
    error,
    rawText,
    correctedText,
    startRecording,
    stopRecording,
    revertToRaw
  };
}

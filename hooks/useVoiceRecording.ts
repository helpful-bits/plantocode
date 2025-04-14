"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { transcribeVoiceAction } from '@/actions/voice-transcription-actions';
import { correctTaskDescriptionAction } from '@/actions/voice-correction-actions';
import { ActionState } from '@/types';

interface UseVoiceRecordingProps {
  onTranscribed: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void;
  foundFiles?: string[];
  languageCode?: string; // Add language code prop
  onInteraction?: () => void;
}

interface VoiceRecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  rawText: string | null;
  correctedText: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  setLanguage: (lang: string) => void; // Add setter for language
  revertToRaw: () => void;
  wrappedOnTranscribed: (text: string) => void;
}

export function useVoiceRecording({
  onTranscribed,
  languageCode: initialLanguageCode = 'en', // Default language
  onCorrectionComplete,
  foundFiles = [],
  onInteraction,
}: UseVoiceRecordingProps): VoiceRecordingState {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>(initialLanguageCode); // State for language
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const isStoppingRef = useRef<boolean>(false);
  const foundFilesRef = useRef<string[]>(foundFiles); // Keep foundFilesRef if needed

  const onTranscribedRef = useRef(onTranscribed);
  const onCorrectionCompleteRef = useRef(onCorrectionComplete);
  const onInteractionRef = useRef(onInteraction);

  useEffect(() => {
    onTranscribedRef.current = onTranscribed;
  }, [onTranscribed]);

  useEffect(() => {
    onCorrectionCompleteRef.current = onCorrectionComplete;
  }, [onCorrectionComplete]);

  useEffect(() => {
    foundFilesRef.current = foundFiles;
  }, [foundFiles]);
  
  useEffect(() => {
    onInteractionRef.current = onInteraction;
  }, [onInteraction]);

  const isSafari = typeof window !== 'undefined' && 
    (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome'));

  const cleanupMedia = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
          console.log("Track stopped:", track.kind);
        }
      });
      mediaStreamRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop();
      } catch (err) {
        console.error("Error stopping mediaRecorder during cleanup:", err);
      }
    }

    mediaRecorderRef.current = null;
    recordingStartTimeRef.current = null;
    isStoppingRef.current = false;
  }, []);

  const handleTranscription = useCallback(async (blob: Blob): Promise<ActionState<string>> => {
    const actualMimeType = blob.type || (isSafari ? 'audio/mp4' : 'audio/webm');
    return await transcribeVoiceAction({ blob, mimeType: actualMimeType, languageCode: language }); // Pass language
  }, [isSafari, language]); // Add language dependency

  // Simplify the correction logic to always attempt to correct if text is provided
  const handleCorrection = useCallback(async (text: string): Promise<ActionState<string>> => { // Added async keyword
    if (text.trim()) {
      return await correctTaskDescriptionAction(text);
    } else {
      return { isSuccess: true, data: text, message: "Empty text, correction skipped." };
    }
  }, []);

  const processAudio = useCallback(async () => {
      const recordingDuration = recordingStartTimeRef.current 
        ? Date.now() - recordingStartTimeRef.current
        : 0;

      if (audioChunksRef.current.length === 0) {
        console.warn(`No audio chunks were collected (${recordingDuration}ms).`);
        setError("No audio was recorded. Please check microphone permissions and try again.");
        cleanupMedia();
        setIsProcessing(false); 
        setIsRecording(false);
        return;
      }
      
      const blobType = audioChunksRef.current[0]?.type || (isSafari ? 'audio/mp4' : 'audio/webm');
      const audioBlob = new Blob(audioChunksRef.current, { type: blobType });

      // Clear chunks immediately after creating blob
      audioChunksRef.current = [];

      if (audioBlob.size < 1000) { 
        console.warn(`Created audio blob is too small: ${audioBlob.size} bytes`);
        setError("Recording is too short or quiet. Please try again and speak clearly.");
        cleanupMedia();
        setIsProcessing(false);
        setIsRecording(false);
        return;
      }

      // Release microphone resources as soon as the blob is created
      cleanupMedia();
      setError(null);
      setIsProcessing(true);
      setRawText(null);
      setCorrectedText(null);

      let currentRawText: string | null = null;

      try {
        const transcriptionResult = await handleTranscription(audioBlob);
        if (!transcriptionResult.isSuccess || typeof transcriptionResult.data !== 'string') {
          setError(transcriptionResult.message || 'Transcription failed');
          throw new Error(transcriptionResult.message || 'Transcription failed');
        }
        
        currentRawText = transcriptionResult.data;
        setRawText(currentRawText);
        const correctionResult = await handleCorrection(currentRawText); // Attempt correction
        let finalText = currentRawText;
        if (correctionResult.isSuccess && correctionResult.data) {
            finalText = correctionResult.data;
            setCorrectedText(finalText);
        } else if (!correctionResult.isSuccess) {
            console.warn("Correction failed, using raw text:", correctionResult.message);
            setCorrectedText(currentRawText);
        }

        if (typeof onTranscribedRef.current === 'function') {
            onTranscribedRef.current(finalText); // Call original onTranscribed
        } else {
            console.warn("onTranscribedRef.current is not a function");
        }
        
        if (onCorrectionCompleteRef.current && correctionResult.isSuccess) { // Call correction complete callback
            onCorrectionCompleteRef.current(currentRawText, finalText);
        }

        if (onInteractionRef.current) {
          onInteractionRef.current();
        }
      } catch (err) {
        console.error("Error processing audio:", err);
        const message = err instanceof Error ? err.message : "Failed to process audio";
        setError(prevError => prevError || message);
      } finally {
        setIsProcessing(false);
        // cleanupMedia() // Moved earlier to release mic sooner
      }
  }, [handleTranscription, handleCorrection, isSafari, cleanupMedia]);

  const stopRecording = useCallback(() => {
    if (isStoppingRef.current || !mediaRecorderRef.current) {
      console.log("Stop recording called but already stopping or no recorder");
      return;
    }
    isStoppingRef.current = true;
    setIsRecording(false);
    
    const recorder = mediaRecorderRef.current;

    if (recorder.state === 'recording') {
      recorder.stop();
    } else {
      console.warn(`Stop called but recorder state is: ${recorder.state}. Trying to process any existing audio.`);
      processAudio();
    }
  }, [processAudio]); 

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing || isStoppingRef.current) {
      console.log(`Start recording prevented: isRecording=${isRecording}, isProcessing=${isProcessing}, isStopping=${isStoppingRef.current}`);
      return;
    }

    setError(null);
    audioChunksRef.current = [];
    isStoppingRef.current = false;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser doesn't support audio recording.");
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error("Browser doesn't support MediaRecorder.");
      }

      let stream: MediaStream;
      try {
        const audioConstraints = { audio: true }; 
        stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        
        if (!stream.active || !stream.getAudioTracks().length || stream.getAudioTracks()[0].readyState !== 'live') {
            cleanupMedia();
            throw new Error("No active audio input device detected or stream is dead.");
        } // Check if stream is active
      } catch (err) {
        console.error("Error accessing media devices:", err);
        const permissionsError = err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
        throw new Error(permissionsError 
          ? "Microphone access denied. Please check browser permissions."
          : "Could not access microphone. Is it connected and enabled?");
      }
      
      let recorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch (err) {
        console.error("Error creating MediaRecorder:", err);
        cleanupMedia();
        throw new Error("Failed to initialize audio recorder.");
      }

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        } else {
        }
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event);
        setError("An error occurred during recording.");
        cleanupMedia(); 
        setIsRecording(false);
        setIsProcessing(false);
      };
      
      recorder.onstop = () => {
        processAudio(); 
      };
      
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now(); 

      recorder.start();

      recordingTimeoutRef.current = setTimeout(() => {
        console.log("Maximum recording time reached, stopping.");
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording' && !isStoppingRef.current) {
          const currentRecorder = mediaRecorderRef.current;
          if (currentRecorder && currentRecorder.state === 'recording' && !isStoppingRef.current) {
            stopRecording(); // Stop recording if timeout reached
          }
        }
      }, 90000);
      
    } catch (err) {
      console.error("Failed to start recording:", err);
      const message = err instanceof Error ? err.message : 'Could not start recording.';
      setError(message);
      cleanupMedia();
      setIsRecording(false);
      setIsProcessing(false);
    }
  }, [isRecording, isProcessing, cleanupMedia, processAudio, stopRecording]); 

  const revertToRaw = useCallback(() => {
    if (rawText !== null) {
      if (typeof onTranscribedRef.current === 'function') {
        onTranscribedRef.current(rawText);
      } else {
        console.warn("onTranscribedRef.current is not a function in revertToRaw");
      }
    } // Call onTranscribed with raw text
  }, [rawText]); 

  useEffect(() => {
    // Cleanup function to stop recording and release resources
    return () => {
      console.log("Hook unmounting, ensuring cleanup.");
    };
  }, [cleanupMedia]);

  const wrappedOnTranscribed = useCallback((text: string) => {
    if (typeof onTranscribedRef.current === 'function') {
      onTranscribedRef.current(text);
    } else {
      console.warn("onTranscribedRef.current is not a function in wrappedOnTranscribed");
    }
    if (onInteractionRef.current) {
      onInteractionRef.current();
    }
  }, []);

  return {
    isRecording,
    isProcessing,
    error,
    rawText,
    correctedText,
    startRecording,
    stopRecording,
    setLanguage, // Expose the language setter
    revertToRaw,
    wrappedOnTranscribed
  };
}

"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { transcribeVoiceAction } from '@/actions/voice-transcription-actions';
import { correctTaskDescriptionAction } from '@/actions/voice-correction-actions'; // Keep correction action import
import { ActionState } from '@/types';

interface UseVoiceRecordingProps {
  onTranscribed: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void;
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
  // removed wrappedOnTranscribed as it's not directly needed externally
}

export function useVoiceRecording({
  onTranscribed,
  languageCode: initialLanguageCode = 'en', // Default language
  onCorrectionComplete,
  onInteraction, // Use the interaction handler
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

  const onTranscribedRef = useRef(onTranscribed);
  const onCorrectionCompleteRef = useRef(onCorrectionComplete);
  const onInteractionRef = useRef(onInteraction);

  useEffect(() => { // Keep effect hook
    onTranscribedRef.current = onTranscribed;
  }, [onTranscribed]);

  useEffect(() => {
    onCorrectionCompleteRef.current = onCorrectionComplete;
  }, [onCorrectionComplete]);
  
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
    // Clean up media recorder if it exists and is recording
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

  // Attempt correction if text is provided
  const handleCorrection = useCallback(async (text: string): Promise<ActionState<string>> => { // Added async keyword
    if (text.trim()) {
      return await correctTaskDescriptionAction(text);
    } else {
      return { isSuccess: true, data: text, message: "Empty text, correction skipped." };
    }
  }, []);
  
  const processAudio = useCallback(async () => {
      const recordingDuration = recordingStartTimeRef.current 
        ? Date.now() - recordingStartTimeRef.current // Keep recording duration calculation
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

      // Release microphone resources as soon as the blob is created and recorder stopped
      cleanupMedia();
      setError(null);
      setIsProcessing(true);
      setRawText(null); // Clear previous text
      setCorrectedText(null); // Clear previous corrected text

      let currentRawText: string | null = null;
      let finalTranscriptionText: string | null = null; // To store the text passed to onTranscribed
      try {
        const transcriptionResult = await handleTranscription(audioBlob);
        if (!transcriptionResult.isSuccess || typeof transcriptionResult.data !== 'string') {
          setError(transcriptionResult.message || 'Transcription failed');
          throw new Error(transcriptionResult.message || 'Transcription failed');
        }

        currentRawText = transcriptionResult.data; // Store raw text
        setRawText(currentRawText); // Keep setting raw text state
        const correctionResult = await handleCorrection(currentRawText); // Attempt correction

        // Determine the final text to use
        finalTranscriptionText = currentRawText; // Default to raw text
        if (correctionResult.isSuccess && correctionResult.data) {
          finalTranscriptionText = correctionResult.data;
          setCorrectedText(finalTranscriptionText); // Store corrected text if correction succeeded
        } else if (!correctionResult.isSuccess) {
          console.warn("Correction failed, using raw text:", correctionResult.message);
          setCorrectedText(currentRawText); // Set corrected text to raw if correction failed
        } // Close else if

        // Call onTranscribed with the FINAL text (corrected or raw)
        if (finalTranscriptionText !== null && typeof onTranscribedRef.current === 'function') { // Keep null check
          onTranscribedRef.current(finalTranscriptionText);
        }
        
        if (onCorrectionCompleteRef.current && correctionResult.isSuccess) { // Call correction complete callback
            onCorrectionCompleteRef.current(currentRawText, finalTranscriptionText);
        } // Close if statement

        if (onInteractionRef.current) {
          onInteractionRef.current();
        }
      } catch (err) {
        console.error("Error processing audio:", err);
        const message = err instanceof Error ? err.message : "Failed to process audio";
        setError(prevError => prevError || message);
      } finally {
        setIsProcessing(false); // Reset processing state
      }
  }, [handleTranscription, handleCorrection, isSafari, cleanupMedia]);

  const stopRecording = useCallback(() => {
    if (isStoppingRef.current || !mediaRecorderRef.current) { // Check if already stopping or no recorder
      console.log("Stop recording called but already stopping or no recorder");
      return;
    }
    isStoppingRef.current = true;
    setIsRecording(false); // Update recording state immediately
    
    const recorder = mediaRecorderRef.current;

    if (recorder.state === 'recording') { // Only stop if recording
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
        cleanupMedia(); // Ensure cleanup on error
        throw new Error("Failed to initialize audio recorder.");
      } // Close try/catch block

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
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
        console.log(`MediaRecorder stopped. State: ${recorder?.state}`); // Log recorder state
        processAudio(); // Process audio when recorder stops
      };
      
      mediaRecorderRef.current = recorder; // Keep recorder reference
      mediaStreamRef.current = stream; // Store the stream reference
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now(); 

      recorder.start();
      console.log(`MediaRecorder started. State: ${recorder.state}`);

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
      if (typeof onTranscribedRef.current === 'function') { // Ensure onTranscribed is a function
        onTranscribedRef.current(rawText); 
      } // Call onTranscribed with raw text
    } // Call onTranscribed with raw text
  }, [rawText]); 

  useEffect(() => {
    // Cleanup function to stop recording and release resources on unmount
    return () => {
      console.log("[useVoiceRecording] Hook unmounting, ensuring cleanup."); // Keep log
      cleanupMedia(); // Ensure cleanup on unmount
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
  }; // Keep return statement
} // End of useVoiceRecording hook

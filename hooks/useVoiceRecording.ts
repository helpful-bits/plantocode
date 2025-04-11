"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import { transcribeVoiceAction } from '@/actions/voice-transcription-actions';
import { correctTaskDescriptionAction } from '@/actions/voice-correction-actions';
import { ActionState } from '@/types';

interface UseVoiceRecordingProps {
  onTranscribed: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void;
  foundFiles?: string[];
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
}: UseVoiceRecordingProps): VoiceRecordingState {
  // Use a ref instead of state for mediaRecorder to avoid state-related re-renders
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const isStoppingRef = useRef<boolean>(false);

  // Refs for props to stabilize dependencies
  const onTranscribedRef = useRef(onTranscribed);
  const onCorrectionCompleteRef = useRef(onCorrectionComplete);
  const foundFilesRef = useRef(foundFiles);

  // Update refs if props change
  useEffect(() => {
    onTranscribedRef.current = onTranscribed;
  }, [onTranscribed]);

  useEffect(() => {
    onCorrectionCompleteRef.current = onCorrectionComplete;
  }, [onCorrectionComplete]);

  useEffect(() => {
    foundFilesRef.current = foundFiles;
  }, [foundFiles]);
  
  const isSafari = typeof window !== 'undefined' && 
    (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome'));

  const cleanupMedia = useCallback(() => {
    console.log("Cleanup media called...");
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
        console.log("Stopping recorder during cleanup...");
        recorder.stop();
      } catch (err) {
        console.error("Error stopping mediaRecorder during cleanup:", err);
      }
    }
    
    mediaRecorderRef.current = null;
    recordingStartTimeRef.current = null;
    isStoppingRef.current = false;
    // Don't reset processing/recording state here, let the caller manage
  }, []);

  const handleTranscription = useCallback(async (blob: Blob): Promise<ActionState<string>> => {
    const actualMimeType = blob.type || (isSafari ? 'audio/mp4' : 'audio/webm');
    console.log("Transcribing with MIME type:", actualMimeType);
    return await transcribeVoiceAction({ blob, mimeType: actualMimeType });
  }, [isSafari]);

  const handleCorrection = useCallback(async (text: string): Promise<ActionState<string>> => {
     const apiKeyExists = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY_EXISTS === 'true';
     // Use ref for foundFiles
     if (apiKeyExists && text.trim()) {
         return await correctTaskDescriptionAction(text, foundFilesRef.current);
     } else {
        return { isSuccess: true, data: text, message: "Correction skipped." };
     }
  }, []);

  const processAudio = useCallback(async () => {
      const recordingDuration = recordingStartTimeRef.current 
        ? Date.now() - recordingStartTimeRef.current
        : 0;
        
      console.log(`Processing Audio. Duration: ${recordingDuration}ms, Chunks: ${audioChunksRef.current.length}`);
      
      if (audioChunksRef.current.length === 0) {
        console.warn(`No audio chunks were collected (${recordingDuration}ms).`);
        setError("No audio was recorded. Please check microphone permissions and try again.");
        cleanupMedia(); // Perform cleanup
        setIsProcessing(false); 
        setIsRecording(false);
        return;
      }
      
      // Create the audio blob from collected chunks
      const blobType = audioChunksRef.current[0]?.type || (isSafari ? 'audio/mp4' : 'audio/webm');
      const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
      console.log("Processing audio blob:", audioBlob.size, audioBlob.type);
      
      if (audioBlob.size < 1000) { 
        console.warn(`Created audio blob is too small: ${audioBlob.size} bytes`);
        setError("Recording is too short or quiet. Please try again and speak clearly.");
        cleanupMedia();
        setIsProcessing(false);
        setIsRecording(false);
        return;
      }
      
      setError(null);
      setIsProcessing(true); // Set processing TRUE
      setRawText(null);
      setCorrectedText(null);

      let currentRawText: string | null = null;

      try {
        // Transcription
        const transcriptionResult = await handleTranscription(audioBlob);
        if (!transcriptionResult.isSuccess || typeof transcriptionResult.data !== 'string') {
          setError(transcriptionResult.message || 'Transcription failed');
          throw new Error(transcriptionResult.message || 'Transcription failed');
        }
        
        currentRawText = transcriptionResult.data;
        setRawText(currentRawText);

        // Correction (Optional)
        const correctionResult = await handleCorrection(currentRawText);
        const finalText = correctionResult.isSuccess ? correctionResult.data : currentRawText;
        setCorrectedText(finalText);

        // Final Callback using ref
        onTranscribedRef.current(finalText);

        // Notify about correction completion if needed using ref
        if (onCorrectionCompleteRef.current && correctionResult.isSuccess && finalText !== currentRawText) {
            onCorrectionCompleteRef.current(currentRawText, finalText);
        }

      } catch (err) {
        console.error("Error processing audio:", err);
        const message = err instanceof Error ? err.message : "Failed to process audio";
        setError(prevError => prevError || message);
      } finally {
        audioChunksRef.current = []; 
        setIsProcessing(false); // Set processing FALSE
        cleanupMedia(); // Ensure cleanup and reset isStoppingRef happens after processing.
        // Cleanup is called by stopRecording or timeout now
        // We might still be in recording state if timeout triggered stop, let stop handle setIsRecording
      }
  }, [handleTranscription, handleCorrection, isSafari, cleanupMedia]); 

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (isStoppingRef.current || !recorder) {
      console.log("Stop recording called but already stopping or no recorder");
      return;
    }
    isStoppingRef.current = true;
    setIsRecording(false); // Update UI immediately
    
    console.log("Stop recording action initiated.");
    console.log("Stopping recording action, state:", recorder.state);

    if (recorder.state === 'recording') {
      recorder.stop(); // This should trigger 'onstop' which calls processAudio
      // Cleanup will happen after processing in processAudio's finally block or if processAudio itself calls cleanup
    } else {
      console.warn(`Stop called but recorder state is: ${recorder.state}. Trying to process any existing audio.`);
      // If inactive or paused, but we might have chunks, try processing
      processAudio(); // This will handle cleanup internally
    }
  }, [processAudio]); 

  const startRecording = useCallback(async () => {
    // Prevent starting if already recording/processing or if stopping
    if (isRecording || isProcessing || isStoppingRef.current) {
      console.log(`Start recording prevented: isRecording=${isRecording}, isProcessing=${isProcessing}, isStopping=${isStoppingRef.current}`);
      return;
    }

    console.log("Attempting to start recording...");
    setError(null);
    audioChunksRef.current = [];
    isStoppingRef.current = false;

    try {
      // Basic browser support checks
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Browser doesn't support audio recording.");
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error("Browser doesn't support MediaRecorder.");
      }

      // Get microphone access
      let stream: MediaStream;
      try {
        console.log("Requesting microphone access...");
        const audioConstraints = { audio: true }; 
        stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
        
        if (!stream.active || !stream.getAudioTracks().length || stream.getAudioTracks()[0].readyState !== 'live') {
            cleanupMedia(); // Clean up potentially dead stream
            throw new Error("No active audio input device detected or stream is dead.");
        }
        console.log("Got active audio track:", stream.getAudioTracks()[0].label);
        mediaStreamRef.current = stream; // Store the stream
        
      } catch (err) {
        console.error("Error accessing media devices:", err);
        const permissionsError = err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
        throw new Error(permissionsError 
          ? "Microphone access denied. Please check browser permissions."
          : "Could not access microphone. Is it connected and enabled?");
      }
      
      // Create MediaRecorder instance
      let recorder;
      try {
        recorder = new MediaRecorder(stream); // Use default mimeType
        console.log(`MediaRecorder created with default mimeType: ${recorder.mimeType}`);
      } catch (err) {
        console.error("Error creating MediaRecorder:", err);
        cleanupMedia(); // Clean up the stream if recorder fails
        throw new Error("Failed to initialize audio recorder.");
      }

      // Assign event handlers *before* starting
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`Audio data received: ${event.data.size} bytes, type: ${event.data.type}`);
        } else {
          console.warn("Received event with empty audio data");
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
        console.log("MediaRecorder onstop event fired.");
        // Process audio. Cleanup is now primarily handled within processAudio
        processAudio(); 
      };
      
      // Store recorder and update state *before* starting
      // Store recorder in ref instead of state
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now(); 

      // Start recording (no timeslice)
      recorder.start();
      console.log("Recording started successfully.");

      // Set maximum recording time (e.g., 90 seconds)
      recordingTimeoutRef.current = setTimeout(() => {
        console.log("Maximum recording time reached, stopping automatically.");
        // Check state before stopping
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording' && !isStoppingRef.current) {
          // Check ref and state before stopping
          const currentRecorder = mediaRecorderRef.current;
          if (currentRecorder && currentRecorder.state === 'recording' && !isStoppingRef.current) {
            stopRecording();
          }
        }
      }, 90000);
      
    } catch (err) {
      console.error("Failed to start recording:", err);
      const message = err instanceof Error ? err.message : 'Could not start recording.';
      setError(message);
      cleanupMedia(); // Ensure cleanup
      setIsRecording(false);
      setIsProcessing(false);
    }
  }, [isRecording, isProcessing, cleanupMedia, processAudio, stopRecording]); 

  const revertToRaw = useCallback(() => {
    // Use ref for onTranscribed
    if (rawText !== null) {
      onTranscribedRef.current(rawText);
    }
  }, [rawText]); 

  // This effect handles cleanup when the component unmounts
  useEffect(() => {
    return () => {
      console.log("Hook unmounting, ensuring cleanup.");
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

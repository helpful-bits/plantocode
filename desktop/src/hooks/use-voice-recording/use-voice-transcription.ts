"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { useMediaDeviceSettings } from "@/hooks/useMediaDeviceSettings";
import { VoiceMediaHandler } from "@/hooks/use-voice-recording";
import { useAudioLevelMonitor, type AudioLevelData } from "@/hooks/use-voice-recording/use-audio-level-monitor";
import { transcribeAudioChunk } from "@/actions/voice-transcription/transcribe";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { getProjectTaskModelSettings } from "@/actions/project-settings.actions";
import { getSessionAction } from "@/actions/session/crud.actions";
import { VoiceTranscriptionSettings } from "@/types";
import { useCorePromptContext } from "@/app/components/generate-prompt/_contexts/core-prompt-context";

// Recording status state machine
type RecordingStatus = 'IDLE' | 'RECORDING' | 'PROCESSING' | 'ERROR';

interface UseVoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  onInteraction?: () => void;
  disabled?: boolean;
}

export function useVoiceTranscription({
  onTranscribed,
  onInteraction,
  disabled = false,
}: UseVoiceTranscriptionProps): {
  status: RecordingStatus;
  statusMessage: string;
  isRecording: boolean;
  isProcessing: boolean;
  duration: number;
  languageCode: string;
  activeAudioInputLabel: string | null;
  activeSessionId: string | null;
  audioLevel: AudioLevelData;
  availableAudioInputs: MediaDeviceInfo[];
  selectedAudioInputId: string;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  setLanguageCode: (code: string) => void;
  selectAudioInput: (deviceId: string) => void;
} {
  // State management
  const [status, setStatus] = useState<RecordingStatus>('IDLE');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [languageCode, setLanguageCode] = useState<string>("en");
  const [duration, setDuration] = useState(0);
  const [transcriptionSettings, setTranscriptionSettings] = useState<VoiceTranscriptionSettings | null>(null);
  const [activeAudioInputLabel, setActiveAudioInputLabel] = useState<string | null>(null);
  const [silenceWarningShown, setSilenceWarningShown] = useState(false);

  // Constants
  const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000;

  // Refs for cleanup and tracking
  const streamRef = useRef<MediaStream | null>(null);
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStoppingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const resolveRecordingRef = useRef<((blob: Blob) => void) | null>(null);

  // Get core context
  const {
    state: { activeSessionId },
  } = useCorePromptContext();

  const { showError } = useNotification();

  // Audio input devices management
  const {
    availableAudioInputs,
    selectedAudioInputId,
    selectAudioInput,
    requestPermissionAndRefreshDevices,
  } = useMediaDeviceSettings();

  // Computed states
  const isRecording = status === 'RECORDING';
  const isProcessing = status === 'PROCESSING';

  // Duration tracking effect
  useEffect(() => {
    if (isRecording) {
      recordingStartTimeRef.current = Date.now();
      
      durationIntervalRef.current = setInterval(() => {
        setDuration((Date.now() - recordingStartTimeRef.current) / 1000);
      }, 100);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isRecording]);

  // Fetch transcription settings when activeSessionId changes
  useEffect(() => {
    const fetchTranscriptionSettings = async () => {
      if (!activeSessionId) {
        setTranscriptionSettings(null);
        return;
      }

      try {
        const sessionResult = await getSessionAction(activeSessionId);
        if (sessionResult.isSuccess && sessionResult.data?.projectDirectory) {
          const settingsResult = await getProjectTaskModelSettings(sessionResult.data.projectDirectory);
          if (settingsResult.isSuccess && settingsResult.data?.voiceTranscription) {
            setTranscriptionSettings(settingsResult.data.voiceTranscription);
            if (settingsResult.data.voiceTranscription.languageCode) {
              setLanguageCode(settingsResult.data.voiceTranscription.languageCode);
            }
          }
        }
      } catch (error) {
        console.warn('[useVoiceTranscription] Failed to fetch transcription settings:', error);
      }
    };

    fetchTranscriptionSettings();
  }, [activeSessionId]);

  // Request audio permissions and enumerate devices on component mount
  useEffect(() => {
    const initializeAudioDevices = async () => {
      try {
        await requestPermissionAndRefreshDevices();
      } catch (error) {
        console.warn('[useVoiceTranscription] Failed to initialize audio devices:', error);
      }
    };

    initializeAudioDevices();
  }, [requestPermissionAndRefreshDevices]);

  // Handle critical errors (only show notifications for critical failures)
  const handleCriticalError = useCallback((error: unknown) => {
    const errorMessage = getErrorMessage(error, "transcription");
    setStatus('ERROR');
    setStatusMessage(errorMessage);
    showError({
      title: "Voice Transcription Error",
      message: errorMessage,
    });
  }, [showError]);

  // Handle transcription completion
  const handleTranscriptionComplete = useCallback((text: string) => {
    if (!text.trim()) return;

    // Simply call the onTranscribed callback which is properly wired to appendText
    // The parent component (task-description.tsx) handles the text insertion correctly
    onTranscribed(text.trim());
    onInteraction?.();
  }, [onTranscribed, onInteraction]);

  // Audio level monitoring
  const { audioLevel } = useAudioLevelMonitor({
    stream: streamRef.current,
    isActive: isRecording,
    silenceThreshold: 0.01,
    onSilenceDetected: (isSilent) => {
      if (isSilent && isRecording && !silenceWarningShown) {
        setStatusMessage('No audio detected - check microphone levels');
        setSilenceWarningShown(true);
      } else if (!isSilent && silenceWarningShown) {
        setStatusMessage('Recording audio...');
        setSilenceWarningShown(false);
      }
    },
  });


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending timeout
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }

      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }

      // Stop media recorder if active
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch (e) {
          console.warn("Error stopping recorder during cleanup:", e);
        }
      }

      // Stop media streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Handle recording start
  const startRecording = useCallback(async () => {
    if (!activeSessionId || disabled || isRecording || isProcessing) {
      return;
    }

    try {
      setStatus('RECORDING');
      setStatusMessage('Recording audio...');
      isStoppingRef.current = false;
      setSilenceWarningShown(false);
      setDuration(0);

      const media = await VoiceMediaHandler.setupMedia({
        onDataAvailable: () => {},
        onError: handleCriticalError,
        onStop: () => {},
        deviceId: selectedAudioInputId,
      });

      if (!media) {
        setStatus('ERROR');
        setStatusMessage('Failed to setup media');
        return;
      }

      streamRef.current = media.stream;

      if (media.activeDeviceLabel) {
        setActiveAudioInputLabel(media.activeDeviceLabel);
      }

      // Clear previous audio chunks
      audioChunksRef.current = [];

      // Find supported MIME type
      const mimeTypePreference = [
        "audio/webm",
        "audio/mp4", 
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "",
      ];

      let mimeType = mimeTypePreference.find((type) => {
        return type === "" || MediaRecorder.isTypeSupported(type);
      });

      // Clean up MIME type by removing codec parameters if present
      if (mimeType && mimeType.includes(';')) {
        mimeType = mimeType.split(';')[0].trim();
      }

      const recorderOptions: MediaRecorderOptions = {
        mimeType: mimeType || undefined,
      };

      // Set audio bitrate if supported
      if ("audioBitsPerSecond" in MediaRecorder.prototype) {
        (recorderOptions as Record<string, unknown>).audioBitsPerSecond = 128000;
      }

      const recorder = new MediaRecorder(media.stream, recorderOptions);
      recorderRef.current = recorder;

      // Handle data available event
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle stop event
      recorder.onstop = () => {
        const finalMimeType = recorder.mimeType || mimeType || "audio/webm";
        const combinedBlob = new Blob(audioChunksRef.current, { type: finalMimeType });

        if (resolveRecordingRef.current) {
          resolveRecordingRef.current(combinedBlob);
          resolveRecordingRef.current = null;
        }
      };

      // Handle errors
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);

        if (resolveRecordingRef.current) {
          resolveRecordingRef.current(new Blob([], { type: "audio/webm" }));
          resolveRecordingRef.current = null;
        }
      };

      // Start recording without timeslice to get one complete, properly formatted blob
      // This ensures the MediaRecorder writes proper WebM headers and container format
      recorder.start();

      // Auto-stop after maximum duration
      autoStopTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_DURATION_MS);
    } catch (error) {
      const errorMessage = getErrorMessage(error, "transcription");
      handleCriticalError(errorMessage);
    }
  }, [activeSessionId, disabled, isRecording, isProcessing, selectedAudioInputId, handleCriticalError]);

  // Handle recording stop
  const stopRecording = useCallback(async () => {
    if (!isRecording) {
      return;
    }

    try {
      isStoppingRef.current = true;
      
      // Clear auto-stop timeout if recording is stopped manually
      if (autoStopTimeoutRef.current) {
        clearTimeout(autoStopTimeoutRef.current);
        autoStopTimeoutRef.current = null;
      }

      // Stop the recorder and get the combined audio blob
      const audioBlob = await new Promise<Blob>((resolve) => {
        if (!recorderRef.current) {
          resolve(new Blob([], { type: "audio/webm" }));
          return;
        }

        resolveRecordingRef.current = resolve;

        try {
          if (recorderRef.current.state === "recording") {
            recorderRef.current.stop();
          } else {
            resolve(new Blob([], { type: "audio/webm" }));
            resolveRecordingRef.current = null;
          }
        } catch (error) {
          console.error("Error stopping recording:", error);
          resolve(new Blob([], { type: "audio/webm" }));
          resolveRecordingRef.current = null;
        }
      });

      const recordingDuration = duration;
      
      // Clean up media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Start processing
      setStatus('PROCESSING');
      setStatusMessage('Transcribing audio...');

      // Minimum recording duration check (0.3 seconds)
      if (recordingDuration < 0.3) {
        setStatusMessage('Recording too short - please record for at least 0.3 seconds');
        isStoppingRef.current = false;
        setStatus('IDLE');
        return;
      }

      if (audioBlob.size > 0) {
        try {
          // Get the MIME type from the blob or default to webm
          const mimeType = audioBlob.type || "audio/webm";

          // Validate WebM format if that's what we're using
          if (mimeType.includes('webm')) {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // Check for EBML header (0x1A 0x45 0xDF 0xA3)
            if (bytes.length < 4 || bytes[0] !== 0x1A || bytes[1] !== 0x45 || bytes[2] !== 0xDF || bytes[3] !== 0xA3) {
              console.warn('[VoiceTranscription] Invalid WebM format detected, blob size:', audioBlob.size);
              setStatusMessage('Recording format error - please try again');
              isStoppingRef.current = false;
              setStatus('IDLE');
              return;
            }
          }

          // Transcribe the complete audio
          const result = await transcribeAudioChunk(
            audioBlob,
            Math.round(recordingDuration * 1000),
            mimeType,
            languageCode,
            transcriptionSettings?.prompt,
            transcriptionSettings?.temperature ?? 0.0,
            transcriptionSettings?.model
          );

          // Handle successful transcription
          if (result.text && result.text.trim()) {
            handleTranscriptionComplete(result.text);
            setStatusMessage('Transcription complete');
          } else {
            setStatusMessage('No speech detected');
          }
        } catch (error) {
          handleCriticalError(error);
          return;
        }
      } else {
        setStatusMessage('No audio recorded');
      }

      // Reset to idle state
      isStoppingRef.current = false;
      setStatus('IDLE');
    } catch (error) {
      const errorMessage = getErrorMessage(error, "transcription");
      handleCriticalError(errorMessage);
    }
  }, [isRecording, duration, streamRef, languageCode, transcriptionSettings, handleTranscriptionComplete, handleCriticalError]);

  return {
    // State
    status,
    statusMessage,
    isRecording,
    isProcessing,
    duration,
    languageCode,
    activeAudioInputLabel,
    activeSessionId,

    // Audio
    audioLevel,
    availableAudioInputs,
    selectedAudioInputId,

    // Actions
    startRecording,
    stopRecording,
    setLanguageCode,
    selectAudioInput,
  };
}
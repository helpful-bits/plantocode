"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import {
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { useVoiceMediaState, useAudioInputDevices } from "@/hooks/use-voice-recording";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from "@/ui";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { getModelSettingsForProject } from "@/actions/project-settings.actions";
import { getSessionAction } from "@/actions/session/crud.actions";
import { TaskModelSettings } from "@/types";

import { transcribeAudioBlobAction } from "@/actions/voice-transcription";
import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { type TaskDescriptionHandle } from "./task-description";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  onInteraction?: () => void;
  textareaRef?: React.RefObject<TaskDescriptionHandle | null> | undefined;
  disabled?: boolean;
}

// Enhanced language options with more languages
const ENHANCED_TRANSCRIPTION_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
] as const;

const VoiceTranscription = function VoiceTranscription({
  onTranscribed,
  onInteraction,
  textareaRef,
  disabled = false,
}: VoiceTranscriptionProps) {
  const [languageCode, setLanguageCode] = useState<string>("en");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcriptionSettings, setTranscriptionSettings] = useState<TaskModelSettings | null>(null);
  

  // Refs for cleanup and tracking
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get core context
  const {
    state: { activeSessionId },
  } = useCorePromptContext();
  
  
  const { showNotification } = useNotification();

  // Audio input devices management
  const {
    availableAudioInputs,
    selectedAudioInputId,
    selectAudioInput,
    requestPermissionAndRefreshDevices,
  } = useAudioInputDevices();

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
          const settingsResult = await getModelSettingsForProject(sessionResult.data.projectDirectory);
          if (settingsResult.isSuccess && settingsResult.data?.voiceTranscription) {
            setTranscriptionSettings(settingsResult.data.voiceTranscription);
            if (settingsResult.data.voiceTranscription.languageCode) {
              setLanguageCode(settingsResult.data.voiceTranscription.languageCode);
            }
          }
        }
      } catch (error) {
        console.warn('[VoiceTranscription] Failed to fetch transcription settings:', error);
      }
    };

    fetchTranscriptionSettings();
  }, [activeSessionId]);

  // Request audio permissions and enumerate devices on component mount
  useEffect(() => {
    // Check and request permissions immediately when component loads
    const initializeAudioDevices = async () => {
      try {
        await requestPermissionAndRefreshDevices();
      } catch (error) {
        console.warn('[VoiceTranscription] Failed to initialize audio devices:', error);
      }
    };

    initializeAudioDevices();
  }, [requestPermissionAndRefreshDevices]);

  // Handle errors
  const handleError = useCallback((error: string) => {
    setRecordingError(error);
    showNotification({
      title: "Voice Transcription Error",
      message: error,
      type: "error",
    });
  }, [showNotification]);

  // Voice media state hook (5-second chunking)
  const {
    startMediaRecording,
    stopMediaRecording,
    activeAudioInputLabel,
  } = useVoiceMediaState({
    onError: handleError,
    selectedAudioInputId,
  });

  // Handle transcription of completed audio blob
  const handleTranscription = useCallback(async (audioBlob: Blob) => {
    if (!activeSessionId) {
      handleError("No active session for transcription");
      return;
    }

    setIsTranscribing(true);
    
    try {
      const result = await transcribeAudioBlobAction(
        audioBlob,
        activeSessionId,
        languageCode,
        undefined,
        transcriptionSettings?.temperature ?? 0.0,
        transcriptionSettings?.model
      );

      if (result.isSuccess && result.data?.text) {
        const transcribedText = result.data.text.trim();
        
        if (textareaRef?.current && transcribedText) {
          try {
            textareaRef.current.insertTextAtCursorPosition(transcribedText);
            onInteraction?.();
          } catch (error) {
            onTranscribed(transcribedText);
            onInteraction?.();
          }
        } else {
          onTranscribed(transcribedText);
          onInteraction?.();
        }

        showNotification({
          title: "Transcription Complete",
          message: `Successfully transcribed ${Math.round(recordingDuration)}s of audio`,
          type: "success",
        });
      } else {
        handleError(result.message || "Transcription failed");
      }
    } catch (error) {
      handleError(getErrorMessage(error, "transcription"));
    } finally {
      setIsTranscribing(false);
    }
  }, [activeSessionId, languageCode, transcriptionSettings, textareaRef, onTranscribed, onInteraction, recordingDuration, showNotification, handleError]);


  // Duration tracking
  useEffect(() => {
    if (isRecording) {
      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);
      
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration((Date.now() - recordingStartTimeRef.current) / 1000);
      }, 1000);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop any active recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      
      // Stop media streams
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Clear duration interval
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  // Handle recording start
  const startRecording = useCallback(async () => {
    if (!activeSessionId || disabled || isRecording || isTranscribing) {
      return;
    }

    try {
      setRecordingError(null);

      const media = await startMediaRecording((audioBlob: Blob) => {
        // This callback is called when recording stops
        handleTranscription(audioBlob);
      });

      if (media) {
        mediaRecorderRef.current = media.recorder;
        streamRef.current = media.stream;
        setIsRecording(true);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error, "transcription");
      handleError(errorMessage);
    }
  }, [activeSessionId, disabled, isRecording, isTranscribing, startMediaRecording, handleTranscription, handleError]);

  // Handle recording stop
  const stopRecording = useCallback(async () => {
    if (!isRecording) {
      return;
    }

    try {
      await stopMediaRecording();
      setIsRecording(false);
      // Note: handleTranscription will be called automatically via the onComplete callback
    } catch (error) {
      const errorMessage = getErrorMessage(error, "transcription");
      handleError(errorMessage);
    }
  }, [isRecording, stopMediaRecording, handleError]);

  // Toggle recording
  const handleToggleRecording = useCallback(async () => {
    if (disabled || !activeSessionId || isTranscribing) {
      if (!activeSessionId) {
        showNotification({
          title: "Session Error",
          message: "Cannot record - no active session.",
          type: "error",
        });
      }
      return;
    }

    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [disabled, activeSessionId, isRecording, isTranscribing, stopRecording, startRecording, showNotification]);

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="inline-flex flex-col gap-3 border border-border/60 rounded-xl p-6 bg-card/95 backdrop-blur-sm shadow-soft max-w-fit">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-foreground mr-2">
          Record Description:
        </div>
        <Button
          type="button"
          onClick={handleToggleRecording}
          disabled={!activeSessionId || disabled || isTranscribing}
          variant={isRecording ? "destructive" : "secondary"}
          size="sm"
          className="min-w-[140px]"
          title={
            disabled
              ? "Feature disabled during session switching"
              : !activeSessionId
                ? "Please select or create a session to enable voice recording"
                : isTranscribing
                  ? "Please wait for transcription to complete"
                : undefined
          }
        >
          {isRecording ? (
            <>
              <MicOff className="h-4 w-4 mr-2" />
              <span>Stop Recording</span>
            </>
          ) : isTranscribing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              <span>Transcribing...</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4 mr-2" />
              <span>Record Audio</span>
            </>
          )}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground text-balance">
          Record your task description using your microphone. Click stop when finished, and AI will transcribe 
          your complete recording. Maximum recording time: 10 minutes.
        </p>
        
      </div>
      {(isRecording || isTranscribing) && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
          <div className="flex gap-4 items-center">
            {isRecording && (
              <>
                <span className="text-primary">● Recording</span>
                <span>Duration: {formatDuration(recordingDuration)}</span>
                <span>Max: 10:00</span>
              </>
            )}
            {isTranscribing && (
              <span className="text-primary">🎵 Transcribing audio...</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-row gap-4 items-start mt-2">
        <div className="flex flex-col">
          <Label htmlFor="language-select" className="text-xs mb-1 text-foreground">
            Language
          </Label>
          <div className="h-9">
            <div className="w-[130px]">
              <Select
                value={languageCode}
                onValueChange={setLanguageCode}
                disabled={isRecording || isTranscribing || !activeSessionId || disabled}
              >
                <SelectTrigger id="language-select" className="w-full h-9">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {ENHANCED_TRANSCRIPTION_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      <div className="flex items-center gap-2">
                        <span>{lang.nativeName}</span>
                        <span className="text-xs text-muted-foreground">({lang.name})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-balance">
            Language for transcription
          </p>
        </div>

        <div className="flex flex-col">
          <Label htmlFor="microphone-select" className="text-xs mb-1 text-foreground">
            Microphone
          </Label>
          <div className="h-9">
            <div className="w-[280px]">
              <Select
                value={selectedAudioInputId}
                onValueChange={selectAudioInput}
                disabled={
                  isRecording ||
                  isTranscribing ||
                  !activeSessionId ||
                  disabled ||
                  availableAudioInputs.length === 0
                }
              >
                <SelectTrigger id="microphone-select" className="w-full h-9">
                  <SelectValue placeholder="Select microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">System Default</SelectItem>
                  {availableAudioInputs.map((device, index) => (
                    <SelectItem key={device.deviceId} value={device.deviceId || `device-${index}`}>
                      {device.label || `Microphone ${index + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-balance">
            {activeAudioInputLabel 
              ? `Using: ${activeAudioInputLabel}`
              : availableAudioInputs.length > 0 
                ? "Devices available - select one to use"
                : "No microphone found. Check system settings."
            }
          </p>
        </div>
      </div>

      {/* Show error message */}
      {recordingError && (
        <div className="mt-2">
          <div className="text-sm text-destructive">
            {recordingError}
          </div>
        </div>
      )}
    </div>
  );
};

VoiceTranscription.displayName = "VoiceTranscription";

export default VoiceTranscription;
"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import {
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { useVoiceMediaState, useBatchTranscriptionProcessor } from "@/hooks/use-voice-recording";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  Badge,
  Alert,
} from "@/ui";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling";
import { useProject } from "@/contexts/project-context";
import { getModelSettingsForProject } from "@/actions/project-settings.actions";

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
  const [selectedAudioInputId, setSelectedAudioInputId] = useState<string>("default");
  const [isRecording, setIsRecording] = useState(false);
  const [availableInputs, setAvailableInputs] = useState<MediaDeviceInfo[]>([]);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  
  // Transcription settings from project configuration
  const [transcriptionSettings, setTranscriptionSettings] = useState({
    transcriptionPrompt: '',
    transcriptionModel: 'whisper-large-v3',
    languageCode: 'en',
    temperature: 0.0,
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Refs for cleanup and tracking
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);
  const previousTextRef = useRef("");

  // Get core context
  const {
    state: { activeSessionId },
  } = useCorePromptContext();
  
  const { showNotification } = useNotification();
  const { projectDirectory } = useProject();

  // Load transcription settings from project configuration
  useEffect(() => {
    const loadTranscriptionSettings = async () => {
      if (!projectDirectory) return;
      
      try {
        setSettingsError(null);
        const result = await getModelSettingsForProject(projectDirectory);
        
        if (result.isSuccess && result.data?.voiceTranscription) {
          const voiceSettings = result.data.voiceTranscription;
          const newSettings = {
            transcriptionPrompt: voiceSettings.transcriptionPrompt || '',
            transcriptionModel: voiceSettings.transcriptionModel || 'whisper-large-v3',
            languageCode: voiceSettings.languageCode || 'en',
            temperature: voiceSettings.temperature ?? 0.0,
          };
          
          setTranscriptionSettings(newSettings);
          setLanguageCode(newSettings.languageCode);
        }
        setSettingsLoaded(true);
      } catch (error) {
        console.error('Failed to load transcription settings:', error);
        setSettingsError('Failed to load transcription settings from project configuration');
        setSettingsLoaded(true);
      }
    };

    loadTranscriptionSettings();
  }, [projectDirectory]);

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

  // Progressive text display state
  const [displayText, setDisplayText] = useState("");

  const {
    processAudioChunk,
    isProcessing: isTranscribing,
    resetProcessor,
    getStats,
    cleanup: cleanupProcessor,
  } = useBatchTranscriptionProcessor({
    sessionId: activeSessionId || "",
    languageCode: transcriptionSettings.languageCode === "en" ? undefined : transcriptionSettings.languageCode,
    transcriptionPrompt: transcriptionSettings.transcriptionPrompt,
    transcriptionModel: transcriptionSettings.transcriptionModel,
    temperature: transcriptionSettings.temperature,
    onTextUpdate: (fullText: string) => {
      if (!isMountedRef.current) return;
      
      const trimmedText = fullText.trim();
      setDisplayText(trimmedText);
      
      // Update textarea progressively if available
      if (textareaRef?.current && trimmedText) {
        try {
          const previousText = previousTextRef.current;
          
          if (previousText && trimmedText.startsWith(previousText)) {
            const newPart = trimmedText.slice(previousText.length).trim();
            if (newPart) {
              textareaRef.current.appendText(" " + newPart);
            }
          } else if (previousText) {
            textareaRef.current.replaceText(previousText, trimmedText);
          } else {
            textareaRef.current.insertTextAtCursorPosition(trimmedText);
          }
          
          previousTextRef.current = trimmedText;
          onInteraction?.();
        } catch (error) {
          try {
            onTranscribed(trimmedText);
            onInteraction?.();
          } catch (fallbackError) {}
        }
      } else {
        onTranscribed(trimmedText);
        onInteraction?.();
      }
    },
    onChunkComplete: () => {
      if (!isMountedRef.current) return;
    },
    onError: handleError,
  });

  // Load available audio devices
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAvailableInputs(audioInputs);
      } catch (error) {}
    };

    loadDevices();
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      cleanupProcessor();
      
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
    };
  }, [cleanupProcessor]);

  // Handle recording start
  const startRecording = useCallback(async () => {
    if (!activeSessionId || disabled || isRecording) {
      return;
    }

    try {
      setRecordingError(null);
      setDisplayText("");
      previousTextRef.current = "";
      resetProcessor();

      const media = await startMediaRecording((chunk: Blob) => {
        processAudioChunk(chunk).catch((error) => {
          console.error('[VoiceTranscription] processAudioChunk error:', error);
          handleError(getErrorMessage(error, "transcription"));
        });
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
  }, [activeSessionId, disabled, isRecording, startMediaRecording, processAudioChunk, resetProcessor, handleError]);

  // Handle recording stop
  const stopRecording = useCallback(async () => {
    if (!isRecording) {
      return;
    }

    try {
      await stopMediaRecording();
      setIsRecording(false);
    } catch (error) {
      const errorMessage = getErrorMessage(error, "transcription");
      handleError(errorMessage);
    }
  }, [isRecording, stopMediaRecording, handleError]);

  // Toggle recording
  const handleToggleRecording = useCallback(async () => {
    if (disabled || !activeSessionId) {
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
  }, [disabled, activeSessionId, isRecording, stopRecording, startRecording, showNotification]);

  const stats = getStats();

  return (
    <div className="inline-flex flex-col gap-3 border border-border/60 rounded-xl p-6 bg-card/95 backdrop-blur-sm shadow-soft max-w-fit">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-foreground mr-2">
          Record Description:
        </div>
        <Button
          type="button"
          onClick={handleToggleRecording}
          disabled={!activeSessionId || disabled}
          variant={isRecording ? "destructive" : "secondary"}
          size="sm"
          className="min-w-[140px]"
          title={
            disabled
              ? "Feature disabled during session switching"
              : !activeSessionId
                ? "Please select or create a session to enable voice recording"
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
              <span>Processing...</span>
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
          Record your task description using your microphone. AI transcribes your speech in real-time 
          as you speak, with text appearing immediately every 5 seconds.
        </p>
        
        {settingsLoaded && transcriptionSettings.transcriptionPrompt && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Custom Prompt Active
            </Badge>
            <span className="text-xs text-muted-foreground">
              Model: {transcriptionSettings.transcriptionModel} • Temp: {transcriptionSettings.temperature.toFixed(2)}
            </span>
          </div>
        )}
        
        {settingsError && (
          <Alert variant="destructive" className="mt-2">
            <p className="text-xs">{settingsError}</p>
          </Alert>
        )}
      </div>
      {(isRecording || stats.totalChunks > 0) && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
          <div className="flex gap-4">
            <span>Chunks: {stats.totalChunks}</span>
            <span>Completed: {stats.completedChunks}</span>
            {stats.failedChunks > 0 && (
              <span className="text-destructive">Failed: {stats.failedChunks}</span>
            )}
            {isRecording && (
              <span className="text-primary">● Recording</span>
            )}
            {stats.totalChunks > 0 && (
              <span>Success: {Math.round(stats.successRate)}%</span>
            )}
          </div>
          {displayText && (
            <div className="mt-1 text-xs text-foreground/80 italic truncate">
              Current: "{displayText.slice(-60)}..."
            </div>
          )}
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
                onValueChange={setSelectedAudioInputId}
                disabled={
                  isRecording ||
                  isTranscribing ||
                  !activeSessionId ||
                  disabled ||
                  availableInputs.length === 0
                }
              >
                <SelectTrigger id="microphone-select" className="w-full h-9">
                  <SelectValue placeholder="Select microphone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">System Default</SelectItem>
                  {availableInputs.map((device, index) => (
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
              : availableInputs.length > 0 
                ? "Start recording to identify device"
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
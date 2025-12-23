"use client";

import { Mic, MicOff, Clock } from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AudioDeviceSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui";

import { useVoiceTranscription } from "@/hooks/use-voice-recording";
import { TRANSCRIPTION_LANGUAGES } from "@/app/components/settings/shared/task-settings-types";
import { AudioLevelMeter } from "./audio-level-meter";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  onInteraction?: () => void;
  disabled?: boolean;
}

const VoiceTranscription = function VoiceTranscription({
  onTranscribed,
  onInteraction,
  disabled = false,
}: VoiceTranscriptionProps) {
  const {
    // State
    status,
    statusMessage,
    isRecording,
    isProcessing,
    duration: recordingDuration,
    languageCode,
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
  } = useVoiceTranscription({
    onTranscribed,
    onInteraction,
    disabled,
  });

  // Helper to toggle recording
  const handleToggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Computed values
  const hasAudioDevice = availableAudioInputs.length > 0;
  const canRecord = !disabled && !!activeSessionId && hasAudioDevice;

  // UI states for recording transition
  const [showRecordingUI, setShowRecordingUI] = useState(false);
  const [showStartingUI, setShowStartingUI] = useState(false);

  // Handle recording UI transitions
  useEffect(() => {
    if (isRecording) {
      // Immediately show "Starting..." UI
      setShowStartingUI(true);
      setShowRecordingUI(false);
      
      // After 1 second, switch to full recording UI
      const timer = setTimeout(() => {
        setShowStartingUI(false);
        setShowRecordingUI(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    } else {
      // Immediately hide all recording states when stopped
      setShowStartingUI(false);
      setShowRecordingUI(false);
    }
    return undefined;
  }, [isRecording]);

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusDot = () => {
    if (status === 'ERROR') return 'bg-red-500';
    if (isRecording && showRecordingUI) return 'bg-red-500 animate-pulse';
    if (isRecording && showStartingUI) return 'bg-amber-500 animate-bounce';
    if (isProcessing) return 'bg-blue-500 animate-pulse';
    return 'bg-gray-300'; // Neutral gray when ready/idle
  };

  return (
    <div className="inline-flex items-center gap-2">
      {(isRecording || isProcessing || status === 'ERROR') && (
        <div
          className={`w-2 h-2 rounded-full ${getStatusDot()} transition-all duration-200`}
          title={status === 'ERROR' ? 'Error' : isRecording && showRecordingUI ? 'Recording' : isRecording && showStartingUI ? 'Starting recording...' : isProcessing ? 'Processing' : 'Ready'}
        />
      )}

      <Tooltip delayDuration={!hasAudioDevice ? 0 : 200}>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              onClick={canRecord ? handleToggleRecording : undefined}
              variant="ghost"
              size="icon"
              className={`relative h-6 w-6 ${
                isRecording && showRecordingUI
                  ? "bg-red-500 hover:bg-red-600 text-white animate-pulse"
                  : isRecording && showStartingUI
                    ? "bg-amber-500 hover:bg-amber-600 text-white animate-bounce"
                  : canRecord
                    ? "hover:bg-success/10 text-success"
                    : "opacity-40 cursor-not-allowed"
              } transition-all duration-200`}
            >
              {isRecording && showRecordingUI ? (
                <MicOff className="h-4 w-4" />
              ) : isRecording && showStartingUI ? (
                <Mic className="h-4 w-4 animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {disabled
            ? "Feature disabled during session switching"
            : !hasAudioDevice
              ? "No microphone detected. Please connect a microphone and try again."
              : !activeSessionId
                ? "Please select or create a session to enable voice recording"
                : isProcessing
                  ? "Please wait for transcription to complete"
                  : isRecording
                    ? "Click to stop recording"
                    : "Click to start recording"}
        </TooltipContent>
      </Tooltip>

      {isRecording && showStartingUI && (
        <div className="flex items-center gap-2 text-base animate-in fade-in duration-300">
          <div className="relative">
            <div className="w-4 h-4 bg-amber-500 rounded-full animate-pulse" />
            <div className="absolute inset-0 w-4 h-4 bg-amber-400 rounded-full animate-ping opacity-75" />
          </div>
          <span className="text-warning-foreground font-medium bg-warning/10 px-2 py-0.5 rounded-md border border-warning/20 animate-in slide-in-from-right-2 duration-300">
            Starting recording...
          </span>
        </div>
      )}

      {isRecording && showRecordingUI && (
        <div className="flex items-center gap-2 text-base animate-in fade-in slide-in-from-left-3 duration-500">
          <Clock className="h-5 w-5 text-muted-foreground animate-in zoom-in duration-300 delay-100" />
          <span className="text-foreground font-mono min-w-[45px] animate-in slide-in-from-bottom-2 duration-300 delay-200">
            {formatDuration(recordingDuration)}
          </span>
          <div className="w-16 animate-in scale-in duration-300 delay-300">
            <AudioLevelMeter
              currentLevel={audioLevel?.currentLevel || 0}
              isActive={isRecording && showRecordingUI}
              className="h-1"
            />
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="flex items-center gap-2 text-base animate-fade-in">
          <div className="w-4 h-4 border-2 border-info border-t-transparent rounded-full animate-spin" />
          <span className="text-info-foreground font-medium">Processing...</span>
        </div>
      )}

      {!isRecording && !isProcessing && (
        <div className="flex items-center gap-1.5">
          <Select
            value={languageCode}
            onValueChange={setLanguageCode}
            disabled={isRecording || isProcessing || disabled}
          >
            <SelectTrigger className="h-6 w-[100px] text-sm border-0 bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSCRIPTION_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  <span>{lang.nativeName}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AudioDeviceSelect
            value={selectedAudioInputId}
            onValueChange={selectAudioInput}
            disabled={isRecording || isProcessing || !canRecord}
          />
        </div>
      )}

      {status === 'ERROR' && statusMessage && (
        <div className="bg-destructive/10 border border-destructive/20 rounded px-2 py-1 animate-fade-in">
          <div className="text-xs text-destructive-foreground font-medium max-w-[200px] truncate" title={statusMessage}>
            {statusMessage}
          </div>
        </div>
      )}
    </div>
  );
};

VoiceTranscription.displayName = "VoiceTranscription";

export default VoiceTranscription;
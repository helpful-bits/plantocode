"use client";

import { Mic, MicOff, Loader2, RefreshCw } from "lucide-react";
import {
  useState,
  useCallback,
  useEffect,
} from "react";

import { useVoiceRecording } from "@/hooks/use-voice-recording";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from "@/ui";
import { Switch } from "@/ui/switch";
import { useNotification } from "@/contexts/notification-context";
import { getErrorMessage } from "@/utils/error-handling"; // Import error handling utility

import { useCorePromptContext } from "../_contexts/core-prompt-context";

import { type TaskDescriptionHandle } from "./task-description";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  onInteraction?: () => void; // Optional interaction handler
  textareaRef?: React.RefObject<TaskDescriptionHandle | null> | undefined;
  disabled?: boolean; // Added prop to disable the component during session switching
}

const VoiceTranscription = function VoiceTranscription({
  onTranscribed,
  onInteraction,
  textareaRef,
  disabled = false,
}: VoiceTranscriptionProps) {
  const [showRevertOption, setShowRevertOption] = useState(false);
  const [languageCode, setLanguageCode] = useState<string>("en");
  const [autoImproveText, setAutoImproveText] = useState<boolean>(true);
  const [defaultDeviceLabel, setDefaultDeviceLabel] = useState<string | null>(
    null
  );

  // Get core context
  const {
    state: { projectDirectory, activeSessionId },
  } = useCorePromptContext();
  
  const { showNotification } = useNotification();

  // Track active session ID and auto-improve setting changes
  useEffect(() => {
    // No-op, dependency for other effects
  }, [activeSessionId]);

  // Clear revert option when auto-improve setting changes
  useEffect(() => {
    setShowRevertOption(false);
  }, [autoImproveText]);

  const handleCorrectionComplete = useCallback(
    (raw: string, corrected: string) => {
      // Check if raw and corrected text are different and auto-improve is enabled
      if (raw !== corrected && autoImproveText) {
        // Replace the raw text with corrected text if textarea ref is available
        if (textareaRef?.current && textareaRef.current.replaceText) {
          try {
            textareaRef.current.replaceText(raw, corrected);
            
            // Text was replaced successfully
          } catch (error) {
            console.warn("[VoiceTranscription] Error replacing raw text with improved text:", error);
          }
        }
        
        setShowRevertOption(true);
      }
    },
    [textareaRef, showNotification, autoImproveText]
  );

  // Create a wrapper for onTranscribed that inserts at cursor position if ref is available
  // Enhanced with improved error handling and UI stability
  const handleTranscriptionComplete = useCallback(
    (text: string) => {
      // Skip processing if component is disabled
      if (disabled) {
        return;
      }

      // The transcription should have been validated by voice-transcription-handler.ts
      // but we'll add extra validation here for better stability
      if (!text || typeof text !== "string") {
        console.warn("[VoiceTranscription] No valid transcription result received");
        return;
      }

      // Check for meaningful content
      const trimmedText = text.trim();
      if (!trimmedText) {
        console.warn("[VoiceTranscription] Empty transcription result");
        return;
      }


      // Attempt to handle the case where we're in the middle of a session switch
      if (!activeSessionId) {
        console.warn(
          "[VoiceTranscription] No active session when trying to insert transcription"
        );
        showNotification({
          title: "Session Error",
          message: "Cannot insert transcription text - no active session.",
          type: "error",
        });
        return;
      }

      // Insert at cursor position if textarea ref is available
      if (textareaRef?.current) {
        try {
          // Make sure the text has line breaks or spaces if needed
          const formattedText = trimmedText
            .replace(/([.!?])\s*(?=[A-Z])/g, "$1\n\n") // Add paragraph breaks after end-of-sentence punctuation followed by capital
            .replace(/([;:])\s*(?=[a-zA-Z])/g, "$1\n"); // Add line breaks after semicolons and colons

          textareaRef.current.insertTextAtCursorPosition(formattedText);
          // Successfully inserted text at cursor position

          // Call onInteraction to signal the text was inserted
          if (onInteraction) {
            onInteraction();
          }

          // Transcription was inserted successfully
        } catch (_error) {

          // Fall back to the original method if insertion fails
          try {
            onTranscribed(trimmedText);

            // Still call onInteraction to signal that text was changed
            if (onInteraction) {
              onInteraction();
            }

            // Text was added at the end as fallback
          } catch (_fallbackError) {
            console.warn("[VoiceTranscription] Could not insert transcription text");
          }
        }
      } else {
        // Otherwise, call the original onTranscribed function
        onTranscribed(trimmedText);

        // Call onInteraction to signal the text was inserted
        if (onInteraction) {
          onInteraction();
        }
      }
    },
    [textareaRef, onTranscribed, onInteraction, activeSessionId, disabled]
  );

  const {
    isRecording,
    isProcessing,
    error: voiceError, // Get error state
    rawText,
    startRecording, // Function to start recording
    stopRecording, // Function to stop recording
    requestPermissionAndRefreshDevices, // Function to request permission early
    availableAudioInputs, // Available microphones
    selectedAudioInputId, // Currently selected microphone ID
    activeAudioInputLabel, // Label of the active microphone
    selectAudioInput, // Function to select a microphone
  } = useVoiceRecording({
    onTranscribed: handleTranscriptionComplete, // Pass the wrapper function
    onCorrectionComplete: handleCorrectionComplete, // Pass the correction callback
    onInteraction, // Pass the interaction handler
    languageCode, // Pass the current language code to the hook
    sessionId: activeSessionId, // Pass the active session ID for background job tracking
    projectDirectory: projectDirectory || undefined, // Convert null to undefined for projectDirectory
    autoCorrect: autoImproveText, // Use the checkbox state
  });

  // Request microphone permission early to populate device labels
  useEffect(() => {
    // Only request permission if we have an active session and component is not disabled
    if (activeSessionId && !disabled && requestPermissionAndRefreshDevices) {
      // Add a small delay to ensure component is fully mounted
      const timeoutId = setTimeout(async () => {
        try {
          const permissionGranted = await requestPermissionAndRefreshDevices();
          if (permissionGranted) {
            // eslint-disable-next-line no-console
            console.log("[VoiceTranscription] Microphone permission granted early, device labels populated");
          } else {
            // eslint-disable-next-line no-console
            console.log("[VoiceTranscription] Microphone permission denied or unavailable");
            // Don't show a notification for permission denial as it's expected behavior
            // Device labels will be populated when user starts recording
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("[VoiceTranscription] Error requesting early microphone permission:", error);
          // Silently handle permission errors - this is expected in many cases
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
    
    return undefined;
  }, [activeSessionId, disabled, requestPermissionAndRefreshDevices]);

  // Try to identify the default device based on current information
  useEffect(() => {
    // If we already have an active label and the default is selected, use that
    if (activeAudioInputLabel && selectedAudioInputId === "default") {
      setDefaultDeviceLabel(activeAudioInputLabel);
      return;
    }

    // Try to identify a potential default device from available devices
    // Usually the first device is the default one in many browsers
    if (availableAudioInputs.length > 0) {
      // First check if we have a device with labels - browser might not
      // provide labels until after permission is granted
      const hasLabels = availableAudioInputs.some((device) => !!device.label);

      if (hasLabels) {
        const potentialDefault = availableAudioInputs.find(
          (device) =>
            device.deviceId === "default" ||
            (device.label && device.label.toLowerCase().includes("default")) ||
            device.deviceId === ""
        );

        if (potentialDefault && potentialDefault.label) {
          setDefaultDeviceLabel(potentialDefault.label);
        } else if (availableAudioInputs[0].label) {
          // Use first available device as a best guess for default
          setDefaultDeviceLabel(availableAudioInputs[0].label);
        }
      } else {
        // No labeled devices available yet
      }
    }
  }, [availableAudioInputs, activeAudioInputLabel, selectedAudioInputId]);

  const handleToggleRecording = async () => {
    // Skip if component is disabled
    if (disabled) {
      return;
    }

    // Skip if we're in the middle of processing
    if (isProcessing) {
      return;
    }

    // Skip if there's no active session
    if (!activeSessionId) {
      showNotification({
        title: "Session Error",
        message: "Cannot record - no active session.",
        type: "error",
      });
      return;
    }

    try {
      if (!isRecording) {
        // Start recording
        await startRecording();

        // Reset any previous error state when starting a new recording
        setShowRevertOption(false);
      } else {
        // Stop recording
        stopRecording();
      }
    } catch (_error) {
      showNotification({
        title: "Recording Error",
        message: "Could not toggle recording state.",
        type: "error",
      });
    }
  };

  // Retry functionality removed - users should just record again
  const handleRetry = async () => {
    showNotification({
      title: "Please Record Again", 
      message: "For best results, please record your message again.",
      type: "info",
    });
  };

  // Enhanced revert handler with improved error handling and session state awareness
  const handleRevertToRaw = useCallback(() => {
    // Skip if component is disabled
    if (disabled) {
      return;
    }

    // Skip if we're in the middle of a session switch or there's no active session
    if (!activeSessionId) {
      showNotification({
        title: "Session Error",
        message: "Cannot revert to raw text - no active session.",
        type: "error",
      });
      return;
    }

    // Validate the raw text
    if (!rawText || typeof rawText !== "string") {
      showNotification({
        title: "Revert Error",
        message: "No raw transcription text available to revert to.",
        type: "error",
      });
      return;
    }

    // Check for meaningful content
    const trimmedRawText = rawText.trim();
    if (!trimmedRawText) {
      showNotification({
        title: "Empty Raw Text",
        message: "The raw transcription was empty. Nothing to revert to.",
        type: "warning",
      });
      return;
    }


    // Insert raw text at cursor position if textarea ref is available
    if (textareaRef?.current) {
      try {
        // Format raw text for better readability
        // This is less aggressive than the full transcription formatting
        const formattedRawText = trimmedRawText
          .replace(/\s{3,}/g, "\n") // Replace multiple spaces with newlines
          .replace(/([.!?])\s+([A-Z])/g, "$1\n$2"); // Add newlines after sentences

        textareaRef.current.insertTextAtCursorPosition(formattedRawText);

        // Call onInteraction to signal the text was inserted
        if (onInteraction) {
          onInteraction();
        }

        // Provide clear feedback about using the original transcription
        showNotification({
          title: "Using Original Groq Transcription",
          message:
            "Using the direct transcription without Claude&apos;s improvements.",
          type: "success",
        });

        // Hide the revert option since we've now used it
        setShowRevertOption(false);
      } catch (_error) {

        // Fall back to onTranscribed with error handling
        try {
          onTranscribed(trimmedRawText);

          // Call onInteraction to signal the text was inserted
          if (onInteraction) {
            onInteraction();
          }

          // Using original transcription as fallback

          // Hide the revert option since we've now used it
          setShowRevertOption(false);
        } catch (_fallbackError) {
          console.warn("[VoiceTranscription] Could not switch to original transcription");
        }
      }
    } else {
      // Use onTranscribed callback when textarea ref isn't available
      onTranscribed(trimmedRawText);

      if (onInteraction) {
        onInteraction();
      }

      // Hide the revert option
      setShowRevertOption(false);
    }
  }, [
    rawText,
    textareaRef,
    onInteraction,
    onTranscribed,
    activeSessionId,
    disabled,
    setShowRevertOption,
  ]);

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
          className="min-w-[120px]"
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
          ) : isProcessing ? (
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

      <p className="text-xs text-muted-foreground text-balance">
        Record your task description using your microphone. 
        {autoImproveText 
          ? "Groq transcribes and AI automatically improves the text." 
          : "Groq transcribes your speech directly without improvements."
        }
      </p>

      <div className="flex flex-row gap-4 items-start mt-2">
        <div className="flex flex-col">
          <Label htmlFor="auto-improve-toggle" className="text-xs mb-1 text-foreground">
            Auto-improve
          </Label>
          <div className="h-9 flex items-center">
            <Switch
              id="auto-improve-toggle"
              checked={autoImproveText}
              onCheckedChange={setAutoImproveText}
              disabled={isRecording || isProcessing || !activeSessionId || disabled}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-balance">
            {autoImproveText ? "AI enhances transcription" : "Raw transcription only"}
          </p>
        </div>

        <div className="flex flex-col">
          <Label htmlFor="language-select" className="text-xs mb-1 text-foreground">
            Language
          </Label>
          <div className="h-9">
            <div className="w-[130px]">
              <Select
                value={languageCode}
                onValueChange={setLanguageCode}
                disabled={
                  isRecording || isProcessing || !activeSessionId || disabled
                }
              >
                <SelectTrigger
                  id="language-select"
                  className="w-full h-9"
                >
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
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
                  isProcessing ||
                  !activeSessionId ||
                  disabled ||
                  availableAudioInputs.length === 0
                }
              >
                <SelectTrigger
                  id="microphone-select"
                  className="w-full h-9"
                >
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
            {(() => {
              if (activeAudioInputLabel) return `Using: ${activeAudioInputLabel}`;
              if (selectedAudioInputId !== "default") {
                const selectedDevice = availableAudioInputs.find(d => d.deviceId === selectedAudioInputId);
                if (selectedDevice?.label) return `Selected: ${selectedDevice.label}`;
                if (activeSessionId && availableAudioInputs.length > 0) return `Start recording to confirm selected device`;
                if (activeSessionId && availableAudioInputs.length === 0) return `No microphone found. Check system settings.`;
              }
              if (defaultDeviceLabel && availableAudioInputs.length > 0) return `Default: ${defaultDeviceLabel}`;
              if (activeSessionId && availableAudioInputs.length > 0) return "Default device will be identified after recording";
              if (activeSessionId && availableAudioInputs.length === 0) return `No microphone found. Check system settings.`;
              return "Select a session to enable microphone";
            })()}
          </p>
        </div>
      </div>

      {/* Show error message and retry button */}
      {voiceError && (
        <div className="flex flex-col gap-2 mt-2">
          <div className="text-sm text-destructive">
            {getErrorMessage(voiceError, 'transcription')}
          </div>
          <Button
            type="button"
            onClick={handleRetry}
            variant="outline"
            size="compact"
            disabled={isRecording || disabled || isProcessing}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Retry Last Recording
          </Button>
        </div>
      )}

      {showRevertOption && rawText && autoImproveText && (
        <div className="mt-2">
          <Button
            type="button"
            onClick={handleRevertToRaw}
            variant="link"
            size="compact-sm"
            className="justify-start p-0 h-auto text-muted-foreground"
            disabled={disabled}
          >
            Switch to original transcription (without AI improvements)
          </Button>
        </div>
      )}
    </div>
  );
};

VoiceTranscription.displayName = "VoiceTranscription";

export default VoiceTranscription;

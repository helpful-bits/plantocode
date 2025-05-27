"use client";

import { Mic, MicOff, Loader2, RefreshCw, ChevronDown } from "lucide-react";
import {
  useState,
  useCallback,
  useEffect,
} from "react";

import { useVoiceRecording } from "@/hooks/use-voice-recording";
import { Button } from "@/ui/button";
import { toast } from "@/ui/use-toast";
import { createTranscriptionErrorMessage } from "@/utils/error-handling"; // Import error handling utility

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
  const [defaultDeviceLabel, setDefaultDeviceLabel] = useState<string | null>(
    null
  );

  // Get core context
  const {
    state: { projectDirectory, activeSessionId },
  } = useCorePromptContext();

  // Track active session ID
  useEffect(() => {
    // No-op, dependency for other effects
  }, [activeSessionId]);

  const handleCorrectionComplete = useCallback(
    (raw: string, corrected: string) => {
      // Only show revert if correction actually changed the text
      if (raw !== corrected) {
        setShowRevertOption(true);
      }
    },
    []
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
        toast({
          title: "Transcription Error",
          description: "No valid transcription result received.",
          variant: "destructive",
        });
        return;
      }

      // Check for meaningful content
      const trimmedText = text.trim();
      if (!trimmedText) {
        toast({
          title: "Empty Transcription",
          description:
            "The transcription result was empty. Please try speaking more clearly.",
          variant: "warning",
        });
        return;
      }


      // Attempt to handle the case where we're in the middle of a session switch
      if (!activeSessionId) {
        console.warn(
          "[VoiceTranscription] No active session when trying to insert transcription"
        );
        toast({
          title: "Session Error",
          description: "Cannot insert transcription text - no active session.",
          variant: "destructive",
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

          // Provide feedback that transcription was inserted
          toast({
            title: "Transcription Added",
            description: "Your transcribed text has been inserted.",
            variant: "success",
          });
        } catch (_error) {

          // Fall back to the original method if insertion fails
          try {
            onTranscribed(trimmedText);

            // Still call onInteraction to signal that text was changed
            if (onInteraction) {
              onInteraction();
            }

            toast({
              title: "Insertion Fallback",
              description:
                "Couldn't insert at cursor position. Text has been added at the end instead.",
              variant: "warning",
            });
          } catch (_fallbackError) {
            toast({
              title: "Insertion Failed",
              description:
                "Could not insert transcription text. Please try again or type manually.",
              variant: "destructive",
            });
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
    retryLastRecording, // Extract the retry function
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
    autoCorrect: true, // Explicitly set to true to ensure Claude improves Groq transcription
  });

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
      toast({
        title: "Session Error",
        description: "Cannot record - no active session.",
        variant: "destructive",
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
      toast({
        title: "Recording Error",
        description: "Could not toggle recording state.",
        variant: "destructive",
      });
    }
  };

  // Handle retrying the last recording with improved error handling
  const handleRetry = async () => {
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
      toast({
        title: "Session Error",
        description: "Cannot retry - no active session.",
        variant: "destructive",
      });
      return;
    }

    try {
      await retryLastRecording();

      // Provide feedback that retry has started
      toast({
        title: "Retrying Transcription",
        description: "Processing your previous recording again...",
        variant: "success",
      });
    } catch (_error) {
      toast({
        title: "Retry Failed",
        description: "Unable to retry the last recording. Please try recording again.",
        variant: "destructive",
      });
    }
  };

  // Enhanced revert handler with improved error handling and session state awareness
  const handleRevertToRaw = useCallback(() => {
    // Skip if component is disabled
    if (disabled) {
      return;
    }

    // Skip if we're in the middle of a session switch or there's no active session
    if (!activeSessionId) {
      toast({
        title: "Session Error",
        description: "Cannot revert to raw text - no active session.",
        variant: "destructive",
      });
      return;
    }

    // Validate the raw text
    if (!rawText || typeof rawText !== "string") {
      toast({
        title: "Revert Error",
        description: "No raw transcription text available to revert to.",
        variant: "destructive",
      });
      return;
    }

    // Check for meaningful content
    const trimmedRawText = rawText.trim();
    if (!trimmedRawText) {
      toast({
        title: "Empty Raw Text",
        description: "The raw transcription was empty. Nothing to revert to.",
        variant: "warning",
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
        toast({
          title: "Using Original Groq Transcription",
          description:
            "Using the direct transcription without Claude&apos;s improvements.",
          variant: "success",
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

          // Provide feedback about the fallback with clearer explanation
          toast({
            title: "Original Groq Transcription Used",
            description:
              "Using direct transcription without improvements. Added at document end (couldn&apos;t insert at cursor).",
            variant: "warning",
          });

          // Hide the revert option since we've now used it
          setShowRevertOption(false);
        } catch (_fallbackError) {
          toast({
            title: "Transcription Switch Failed",
            description:
              "Could not switch to original Groq transcription. Please try again or type manually.",
            variant: "destructive",
          });
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
    <div className="inline-flex flex-col gap-2 border rounded-lg p-4 bg-card shadow-sm max-w-fit">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-card-foreground mr-2">
          Record Description:
        </div>
        <Button
          type="button"
          onClick={handleToggleRecording}
          disabled={!activeSessionId || disabled}
          isLoading={isProcessing}
          loadingText="Processing..."
          loadingIcon={<Loader2 className="h-4 w-4 animate-spin mr-2" />}
          variant={isRecording ? "destructive" : "secondary"}
          size="sm"
          className="min-w-[120px] flex justify-center items-center gap-2 h-9"
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
          ) : (
            <>
              <Mic className="h-4 w-4 mr-2" />
              <span>Record Audio</span>
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-balance">
        Record your task description using your microphone. Groq transcribes and
        Claude automatically improves the text.
      </p>

      <div className="flex flex-row gap-4 items-start mt-2">
        <div className="flex flex-col">
          <div className="text-xs mb-1">Language</div>
          <div className="h-9">
            <div className="relative w-[130px]">
              <select
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                disabled={
                  isRecording || isProcessing || !activeSessionId || disabled
                }
                className="w-full h-9 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 appearance-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input dark:text-foreground dark:border-border"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <ChevronDown className="h-4 w-4 opacity-50" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 text-balance">
            Language for transcription
          </p>
        </div>

        <div className="flex flex-col">
          <div className="text-xs mb-1">Microphone</div>
          <div className="h-9">
            <div className="relative w-[280px]">
              <select
                value={selectedAudioInputId}
                onChange={(e) => selectAudioInput(e.target.value)}
                disabled={
                  isRecording ||
                  isProcessing ||
                  !activeSessionId ||
                  disabled ||
                  availableAudioInputs.length === 0
                }
                className="w-full h-9 px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 appearance-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input dark:text-foreground dark:border-border text-ellipsis"
              >
                <option value="default">System Default</option>
                {availableAudioInputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <ChevronDown className="h-4 w-4 opacity-50" />
              </div>
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
            {createTranscriptionErrorMessage(voiceError)}
          </div>
          <Button
            type="button"
            onClick={handleRetry}
            variant="outline"
            size="sm"
            className="w-fit text-xs h-8"
            disabled={isRecording || disabled}
            isLoading={isProcessing}
            loadingText="Processing..."
            loadingIcon={<Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Retry Last Recording
          </Button>
        </div>
      )}

      {showRevertOption && rawText && (
        <div className="mt-2">
          <Button
            type="button"
            onClick={handleRevertToRaw}
            variant="link"
            size="sm"
            className="text-muted-foreground justify-start p-0 h-auto text-xs w-fit"
            disabled={disabled}
          >
            Switch to original Groq transcription (without Claude&apos;s
            improvements)
          </Button>
        </div>
      )}
    </div>
  );
};

VoiceTranscription.displayName = "VoiceTranscription";

export default VoiceTranscription;

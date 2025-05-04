"use client";

import { Button } from "@/components/ui/button";
import { useState, useCallback, useRef, useEffect } from "react";
import { useVoiceRecording } from "@/hooks/useVoiceRecording/index"; // Use the new import path
import { Mic, MicOff, Loader2, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProject } from "@/lib/contexts/project-context"; // Add useProject context
import { TaskDescriptionHandle } from "./task-description";
import { toast } from "@/components/ui/use-toast";

interface VoiceTranscriptionProps {
  onTranscribed: (text: string) => void;
  onInteraction?: () => void; // Optional interaction handler
  textareaRef?: React.RefObject<TaskDescriptionHandle>;
}

export default function VoiceTranscription({
  onTranscribed,
  onInteraction,
  textareaRef,
}: VoiceTranscriptionProps) {
  const [showRevertOption, setShowRevertOption] = useState(false);
  const [languageCode, setLanguageCode] = useState('en');
  const { activeSessionId } = useProject(); // Get active session ID from project context
  
  // Log active session ID for debugging
  useEffect(() => {
    console.log(`[VoiceTranscription] Active session ID: ${activeSessionId || 'none'}`);
  }, [activeSessionId]);
  
  const handleCorrectionComplete = useCallback((raw: string, corrected: string) => {
    // Only show revert if correction actually changed the text
    if (raw !== corrected) {
      setShowRevertOption(true);
    }
  }, []);

  // Create a wrapper for onTranscribed that inserts at cursor position if ref is available
  const handleTranscriptionComplete = useCallback((text: string) => {
    // Strict validation before proceeding
    if (!text) {
      console.warn("Received empty text in handleTranscriptionComplete");
      toast({
        title: "Transcription Error",
        description: "Received empty transcription result.",
        variant: "destructive"
      });
      return;
    }
    
    // Ensure text is a string and not just whitespace
    if (typeof text !== 'string' || text.trim() === '') {
      console.warn("Received invalid text type or empty string in handleTranscriptionComplete");
      toast({
        title: "Transcription Error",
        description: "Received invalid or empty transcription result.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if text appears to be a UUID (should be caught upstream, but double-check)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(text.trim())) {
      console.error("Text appears to be a UUID, not inserting:", text);
      toast({
        title: "Transcription Error",
        description: "Received invalid transcription format.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if text is JSON or contains suspicious format identifiers that should have been parsed
    if ((text.startsWith('{') && text.endsWith('}')) || (text.includes('"text":') && text.includes('}'))) {
      try {
        // Attempt to parse as JSON to extract 'text' field if present
        const parsed = JSON.parse(text);
        if (parsed.text && typeof parsed.text === 'string') {
          console.warn("Text appears to be JSON with a text field, extracting text value");
          text = parsed.text;
        }
      } catch (e) {
        // If parsing fails, continue with original text
        console.warn("Text appeared to be JSON but couldn't parse, using as-is");
      }
    }

    // Additional check for extremely short text that might indicate an error
    if (text.trim().length < 3) {
      console.warn("Suspiciously short text received:", text);
      toast({
        title: "Transcription Warning",
        description: "The transcription result is unusually short. You may want to try recording again.",
        variant: "default"
      });
      // Still proceed with the short text, but warn the user
    }
    
    console.log("Handling transcription complete, text:", text.substring(0, 50) + (text.length > 50 ? '...' : ''), "length:", text.length);
    
    if (textareaRef?.current) {
      console.log("Using textareaRef to insert at cursor position");
      try {
        textareaRef.current.insertTextAtCursorPosition(text);
        console.log("Successfully inserted text at cursor position");
        
        // Call onInteraction to signal the text was inserted
        if (onInteraction) {
          onInteraction();
        }
      } catch (error) {
        console.error("Error inserting text at cursor position:", error);
        // Fall back to the original method if insertion fails
        onTranscribed(text);
        toast({
          title: "Insertion Error",
          description: "Couldn't insert at cursor position. Text has been appended instead.",
          variant: "destructive"
        });
      }
    } else {
      console.log("No textareaRef available, using onTranscribed callback");
      // Otherwise, call the original onTranscribed function
      onTranscribed(text);
    }
  }, [textareaRef, onTranscribed, onInteraction]);
  
  const {
    isRecording,
    isProcessing,
    error: voiceError, // Get error state
    rawText,
    startRecording, // Function to start recording
    stopRecording, // Function to stop recording
    retryLastRecording, // Extract the retry function
  } = useVoiceRecording({
    onTranscribed: handleTranscriptionComplete, // Pass the wrapper function
    onCorrectionComplete: handleCorrectionComplete, // Pass the correction callback
    onInteraction, // Pass the interaction handler
    languageCode, // Pass the current language code to the hook
    sessionId: activeSessionId // Pass the active session ID for background job tracking
  });

  const handleToggleRecording = async () => {
    if (!isRecording) { // Check if not currently recording
      await startRecording();
    } else {
      await stopRecording();
    }
  };

  // Handle retrying the last recording
  const handleRetry = async () => {
    try {
      await retryLastRecording();
    } catch (error) {
      console.error("Error retrying recording:", error);
      toast({
        title: "Retry Failed",
        description: "Unable to retry the last recording. Please try recording again.",
        variant: "destructive"
      });
    }
  };

  // Modified revert handler to use cursor position
  const handleRevertToRaw = () => {
    if (!rawText) {
      console.warn("No raw text available to revert to");
      toast({
        title: "Revert Error",
        description: "No raw transcription text available to revert to.",
        variant: "destructive"
      });
      return;
    }
    
    // Ensure the raw text is valid
    if (typeof rawText !== 'string' || rawText.trim() === '') {
      console.warn("Raw text is invalid or empty, cannot revert");
      toast({
        title: "Revert Error",
        description: "Raw transcription text is invalid or empty.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if text appears to be a UUID
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(rawText.trim())) {
      console.error("Raw text appears to be a UUID, not inserting:", rawText);
      toast({
        title: "Revert Error",
        description: "Raw transcription has invalid format.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if text is JSON or contains suspicious format identifiers that should have been parsed
    let processedText = rawText;
    if ((rawText.startsWith('{') && rawText.endsWith('}')) || (rawText.includes('"text":') && rawText.includes('}'))) {
      try {
        // Attempt to parse as JSON to extract 'text' field if present
        const parsed = JSON.parse(rawText);
        if (parsed.text && typeof parsed.text === 'string') {
          console.warn("Raw text appears to be JSON with a text field, extracting text value");
          processedText = parsed.text;
        }
      } catch (e) {
        // If parsing fails, continue with original text
        console.warn("Raw text appeared to be JSON but couldn't parse, using as-is");
      }
    }

    // Additional check for extremely short text that might indicate an error
    if (processedText.trim().length < 3) {
      console.warn("Suspiciously short raw text:", processedText);
      toast({
        title: "Warning",
        description: "The raw transcription is unusually short. You may want to try recording again.",
        variant: "default"
      });
      // Still proceed with the short text, but warn the user
    }
    
    if (textareaRef?.current) {
      console.log("Using textareaRef to insert raw text at cursor position");
      try {
        textareaRef.current.insertTextAtCursorPosition(processedText);
        // Call onInteraction to signal the text was inserted
        if (onInteraction) {
          onInteraction();
        }
      } catch (error) {
        console.error("Error inserting raw text at cursor position:", error);
        // Fall back to onTranscribed
        onTranscribed(processedText);
        if (onInteraction) {
          onInteraction();
        }
        toast({
          title: "Insertion Error",
          description: "Couldn't insert at cursor position. Text has been restored using fallback method.",
          variant: "destructive"
        });
      }
    } else {
      console.log("No textareaRef available, using onTranscribed function");
      onTranscribed(processedText);
      if (onInteraction) {
        onInteraction();
      }
    }
  };

  return (
    <div className="flex flex-col gap-2 border rounded-lg p-4 bg-card shadow-sm">
      <label className="font-semibold text-card-foreground">Record Description:</label>
      <div className="flex gap-2 items-start">
        <div className="flex flex-col">
          <Button
            type="button" // Add type="button"
            onClick={handleToggleRecording}
            disabled={isProcessing}
            variant={isRecording ? "destructive" : "secondary"}
            size="sm"
            className="min-w-[120px] flex justify-center items-center gap-2"
          > {/* Keep button structure */}
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : isRecording ? (
              <>
                <MicOff className="h-4 w-4" />
                <span>Stop Recording</span>
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                <span>Record Audio</span>
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground mt-1">Record your task description using your microphone. Transcription uses Groq (Whisper).</p>
        </div>
        <div className="flex flex-col">
          <div className="h-9">
            <Select value={languageCode} onValueChange={setLanguageCode} disabled={isRecording || isProcessing}>
              <SelectTrigger className="w-[100px] h-9" aria-label="Select transcription language">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                {/* Add more languages as needed */}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Select the language you will be speaking.</p>
        </div>
      </div>
      
      {/* Show error message and retry button */}
      {voiceError && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-destructive">{voiceError}</div>
          <Button
            type="button"
            onClick={handleRetry}
            variant="outline"
            size="sm"
            className="w-fit mt-1 text-xs"
            disabled={isProcessing || isRecording}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry Last Recording
          </Button>
        </div>
      )}
      
      {showRevertOption && rawText && (
        <Button
          type="button"
          onClick={handleRevertToRaw}
          variant="link"
          size="sm"
          className="text-muted-foreground justify-start p-0 h-auto text-xs mt-2 w-fit"
        >
          Revert to raw transcription
        </Button>
      )}
    </div>
  );
}

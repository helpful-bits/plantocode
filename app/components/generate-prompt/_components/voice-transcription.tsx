"use client";

import { Button } from "@/components/ui/button";
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  const handleTranscriptionComplete = useCallback((text: string | any) => {
    // Handle the case where text is an object (background job response)
    let processedText = '';
    
    // First, handle potentially complex input types
    if (text === null || text === undefined) {
      console.error("Received null or undefined text in handleTranscriptionComplete");
      toast({
        title: "Transcription Error",
        description: "No transcription result received.",
        variant: "destructive"
      });
      return;
    }
    
    // If text is an object, try to extract the actual text content
    if (typeof text === 'object') {
      console.log("Received object instead of string, attempting to extract text:", text);
      
      // Handle background job object directly passed
      if (text.isBackgroundJob && text.jobId) {
        console.error("Received background job object directly, should be handled by useBackgroundJob hook:", text);
        toast({
          title: "Processing Error",
          description: "Background job data was passed directly. Please wait for the job to complete.",
          variant: "destructive"
        });
        return;
      }
      
      // Try to extract text from common API response formats
      if (text.response && typeof text.response === 'string') {
        processedText = text.response;
      } else if (text.data && typeof text.data === 'string') {
        processedText = text.data;
      } else if (text.text && typeof text.text === 'string') {
        processedText = text.text;
      } else if (text.content && typeof text.content === 'string') {
        processedText = text.content;
      } else {
        // Last resort - try to stringify the whole object
        try {
          const jsonStr = JSON.stringify(text);
          console.warn("Received object with no recognizable text property, stringified:", jsonStr);
          toast({
            title: "Transcription Warning",
            description: "Received unexpected data format. Attempting to use as-is.",
            variant: "default"
          });
          processedText = jsonStr;
        } catch (e) {
          console.error("Failed to process object data:", e);
          toast({
            title: "Transcription Error",
            description: "Received invalid data that couldn't be processed.",
            variant: "destructive"
          });
          return;
        }
      }
    } else if (typeof text === 'string') {
      // Process the string input
      processedText = text;
    } else {
      // For any other type, try to convert to string
      try {
        processedText = String(text);
        console.warn(`Converted ${typeof text} to string:`, processedText);
      } catch (e) {
        console.error(`Failed to convert ${typeof text} to string:`, e);
        toast({
          title: "Transcription Error", 
          description: "Received invalid data type that couldn't be converted to text.",
          variant: "destructive"
        });
        return;
      }
    }
    
    // At this point, we should have a string in processedText
    // Validate it's not empty
    if (!processedText || processedText.trim() === '') {
      console.warn("Processed text is empty or whitespace");
      toast({
        title: "Transcription Error",
        description: "Received empty transcription result.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if text appears to be a UUID (should be caught upstream, but double-check)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(processedText.trim())) {
      console.error("Text appears to be a UUID, not inserting:", processedText);
      toast({
        title: "Transcription Error",
        description: "Received invalid transcription format (appears to be an ID).",
        variant: "destructive"
      });
      return;
    }
    
    // Check if text is JSON or contains suspicious format identifiers that should have been parsed
    if ((processedText.startsWith('{') && processedText.endsWith('}')) || (processedText.includes('"text":') && processedText.includes('}'))) {
      try {
        // Attempt to parse as JSON to extract 'text' field if present
        const parsed = JSON.parse(processedText);
        if (parsed.text && typeof parsed.text === 'string') {
          console.warn("Text appears to be JSON with a text field, extracting text value");
          processedText = parsed.text;
        } else if (parsed.response && typeof parsed.response === 'string') {
          console.warn("Text appears to be JSON with a response field, extracting value");
          processedText = parsed.response;
        }
      } catch (e) {
        // If parsing fails, continue with original text
        console.warn("Text appeared to be JSON but couldn't parse, using as-is");
      }
    }

    // Additional check for extremely short text that might indicate an error
    if (processedText.trim().length < 3) {
      console.warn("Suspiciously short text received:", processedText);
      toast({
        title: "Transcription Warning",
        description: "The transcription result is unusually short. You may want to try recording again.",
        variant: "default"
      });
      // Still proceed with the short text, but warn the user
    }
    
    console.log("Handling transcription complete, text:", processedText.substring(0, 50) + (processedText.length > 50 ? '...' : ''), "length:", processedText.length);
    
    if (textareaRef?.current) {
      console.log("Using textareaRef to insert at cursor position");
      try {
        textareaRef.current.insertTextAtCursorPosition(processedText);
        console.log("Successfully inserted text at cursor position");
        
        // Call onInteraction to signal the text was inserted
        if (onInteraction) {
          onInteraction();
        }
      } catch (error) {
        console.error("Error inserting text at cursor position:", error);
        // Fall back to the original method if insertion fails
        onTranscribed(processedText);
        toast({
          title: "Insertion Error",
          description: "Couldn't insert at cursor position. Text has been appended instead.",
          variant: "destructive"
        });
      }
    } else {
      console.log("No textareaRef available, using onTranscribed callback");
      // Otherwise, call the original onTranscribed function
      onTranscribed(processedText);
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

  // Modified revert handler to use cursor position - using the same processing logic as handleTranscriptionComplete
  const handleRevertToRaw = useCallback(() => {
    if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
      console.warn("No valid raw text available to revert to");
      toast({
        title: "Revert Error",
        description: "No raw transcription text available to revert to.",
        variant: "destructive"
      });
      return;
    }
    
    // Process the raw text as a string
    let processedText = rawText;
    
    // Validate the processed text
    if (!processedText || processedText.trim() === '') {
      console.warn("Processed raw text is empty or whitespace");
      toast({
        title: "Revert Error",
        description: "Raw transcription text is empty.",
        variant: "destructive"
      });
      return;
    }
    
    // Check if text appears to be a UUID
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(processedText.trim())) {
      console.error("Raw text appears to be a UUID, not inserting:", processedText);
      toast({
        title: "Revert Error",
        description: "Raw transcription has invalid format (appears to be an ID).",
        variant: "destructive"
      });
      return;
    }
    
    // Check if text is JSON or contains suspicious format identifiers that should have been parsed
    if ((processedText.startsWith('{') && processedText.endsWith('}')) || (processedText.includes('"text":') && processedText.includes('}'))) {
      try {
        // Attempt to parse as JSON to extract 'text' field if present
        const parsed = JSON.parse(processedText);
        if (parsed.text && typeof parsed.text === 'string') {
          console.warn("Raw text appears to be JSON with a text field, extracting text value");
          processedText = parsed.text;
        } else if (parsed.response && typeof parsed.response === 'string') {
          console.warn("Raw text appears to be JSON with a response field, extracting value");
          processedText = parsed.response;
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
    
    console.log("Handling revert to raw text, processed text:", processedText.substring(0, 50) + (processedText.length > 50 ? '...' : ''));
    
    if (textareaRef?.current) {
      console.log("Using textareaRef to insert raw text at cursor position");
      try {
        textareaRef.current.insertTextAtCursorPosition(processedText);
        console.log("Successfully inserted raw text at cursor position");
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
  }, [rawText, textareaRef, onInteraction, onTranscribed]);

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
            <div className="inline-block">
              <select
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                disabled={isRecording || isProcessing}
                className="h-9 w-[100px] rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Select transcription language"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
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

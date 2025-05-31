"use client";

import { useState, useRef, useCallback, useEffect } from "react";

import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { type ActionState } from "@/types";
import { JOB_STATUSES, type JobStatus } from "@/types/session-types";
import { getErrorMessage } from "@/utils/error-handling";

import {
  handleTranscription,
  handleCorrection,
  processBackgroundJob,
  processDirectTranscriptionResult,
} from "./voice-transcription-handler";

interface UseVoiceTranscriptionProcessingProps {
  sessionId?: string | null;
  projectDirectory?: string | null;
  autoCorrect?: boolean;
  onTranscribed?: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void;
  onError: (error: string) => void;
  setIsProcessing: (isProcessing: boolean) => void;
}

export function useVoiceTranscriptionProcessing({
  sessionId = null,
  projectDirectory = null,
  autoCorrect = true,
  onTranscribed,
  onCorrectionComplete,
  onError,
  setIsProcessing,
}: UseVoiceTranscriptionProcessingProps) {
  // State management for text
  const [rawText, setRawText] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [textStatus, setTextStatus] = useState<
    "loading" | "done" | "error" | undefined
  >(undefined);

  // Track background job ID - we now use a single job for both transcription and correction
  const [transcriptionJobId, setTranscriptionJobId] = useState<string | null>(
    null
  );

  // Keep track of already processed jobs to prevent duplicate processing
  const processedJobsRef = useRef<Set<string>>(new Set());
  
  // Track component mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  
  // Store latest callback refs to avoid effect re-runs when callbacks change
  // This provides additional protection against unstable callback references
  const callbacksRef = useRef({
    onTranscribed,
    onCorrectionComplete,
  });
  
  // Update callback refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onTranscribed,
      onCorrectionComplete,
    };
  }, [onTranscribed, onCorrectionComplete]);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Get the background job from context using typed hook
  const { job: transcriptionJobData } = useBackgroundJob(transcriptionJobId);

  // Unified function to update state (only if component is still mounted)
  const updateState = useCallback(
    (state: { error?: string | null; isProcessing?: boolean }) => {
      if (!isMountedRef.current) return;
      
      if (state.error !== undefined) {
        // Only call onError if there's actually an error message
        if (state.error) {
          onError(state.error);
        }
      }
      if (state.isProcessing !== undefined) {
        setIsProcessing(state.isProcessing);
      }
    },
    [onError, setIsProcessing]
  );

  // Helper function to process transcription results with common logic
  const processTranscriptionResult = useCallback(
    async (
      result: ActionState<unknown>,
      isCorrectionPhase: boolean,
      _originalTextForCorrection?: string
    ): Promise<void> => {
      try {
        // Handle failure case first
        if (!result.isSuccess) {
          const errorMessage = result.message || "Failed to process voice recording";
          updateState({
            error: errorMessage,
            isProcessing: false,
          });
          setTextStatus("error");
          return;
        }

        // Check if we received a background job
        if (
          typeof result.data === "object" &&
          result.data && "isBackgroundJob" in result.data &&
          "jobId" in result.data
        ) {
          // eslint-disable-next-line no-console
          console.log(
            `[VoiceRecording] ${isCorrectionPhase ? "Correction" : "Transcription"} submitted as background job: ${String((result.data as {jobId: string}).jobId)}`
          );
          // Store the job ID for tracking
          setTranscriptionJobId(String((result.data as {jobId: string}).jobId));
          return;
        }

        // Check for job ID in metadata
        if (
          typeof result.metadata === "object" &&
          result.metadata &&
          "jobId" in result.metadata
        ) {
          // eslint-disable-next-line no-console
          console.log(
            "[VoiceRecording] Job ID found in metadata:", 
            String(result.metadata.jobId)
          );
          setTranscriptionJobId(String(result.metadata.jobId));

          // Handle immediate text result
          if (typeof result.data === "string") {
            await processDirectTranscriptionResult(
              result.data,
              isCorrectionPhase,
              autoCorrect,
              sessionId,
              transcriptionJobId,
              projectDirectory ?? undefined,
              setRawText,
              setCorrectedText,
              setTextStatus,
              updateState,
              callbacksRef.current.onTranscribed,
              callbacksRef.current.onCorrectionComplete
            );
          }

          return;
        }

        // Direct text response
        if (typeof result.data === "string") {
          await processDirectTranscriptionResult(
            result.data,
            isCorrectionPhase,
            autoCorrect,
            sessionId,
            transcriptionJobId,
            projectDirectory ?? undefined,
            setRawText,
            setCorrectedText,
            setTextStatus,
            updateState,
            callbacksRef.current.onTranscribed,
            callbacksRef.current.onCorrectionComplete
          );
        }
      } catch (error) {
        console.error(
          "[VoiceRecording] Error processing transcription result:",
          error
        );
        updateState({ error: getErrorMessage(error, 'transcription'), isProcessing: false });
        setTextStatus("error");
      }
    },
    [
      updateState,
      autoCorrect,
      sessionId,
      transcriptionJobId,
      projectDirectory,
      // Note: onTranscribed and onCorrectionComplete are handled via callbacksRef
    ]
  );

  // Function to process transcription
  const processTranscription = useCallback(
    async (audioBlob: Blob): Promise<void> => {
      try {
        // Validate sessionId is either string or null
        if (sessionId !== null && typeof sessionId !== "string") {
          console.error(
            `[VoiceRecording] Invalid sessionId type: ${typeof sessionId}, value:`,
            sessionId
          );
          updateState({
            error: "Invalid session ID format",
            isProcessing: false,
          });
          setTextStatus("error");
          return;
        }

        // Send for transcription
        setTextStatus("loading");
        // eslint-disable-next-line no-console
        console.log(
          `[VoiceRecording] Sending ${audioBlob.size} bytes for transcription, sessionId: ${sessionId || "none"}, projectDirectory: ${projectDirectory || "/"}`
        );

        // Pass the sessionId directly to server - it will handle validation and creation of temporary sessions if needed
        const result = await handleTranscription(
          audioBlob,
          sessionId,
          projectDirectory ?? undefined
        );

        // Process the result
        await processTranscriptionResult(result, false);
      } catch (err) {
        console.error("[VoiceRecording] Error in processTranscription:", err);
        updateState({ error: getErrorMessage(err, 'transcription'), isProcessing: false });
        setTextStatus("error");
      }
    },
    [sessionId, projectDirectory, updateState, processTranscriptionResult]
  );
  
  // Function to retry transcription with the last audio blob
  const retryTranscription = useCallback(
    async (audioBlob: Blob): Promise<void> => {
      try {
        // Reset error state and set processing
        updateState({ error: null, isProcessing: true });
        setTextStatus("loading");

        // Reset job ID to ensure we create a new job
        setTranscriptionJobId(null);

        // eslint-disable-next-line no-console
        console.log(
          `[VoiceRecording] Retrying with audio blob: ${audioBlob.size} bytes`
        );

        // Send for transcription with original sessionId - server handles validation
        const result = await handleTranscription(
          audioBlob,
          sessionId,
          projectDirectory ?? undefined
        );

        // Process the result
        await processTranscriptionResult(result, false);
      } catch (err) {
        console.error("[VoiceRecording] Error in retryTranscription:", err);
        updateState({ error: getErrorMessage(err, 'transcription'), isProcessing: false });
        setTextStatus("error");
      }
    },
    [updateState, sessionId, projectDirectory, processTranscriptionResult]
  );

  // Reset all transcription processing state
  const resetTranscriptionState = useCallback(() => {
    setRawText(null);
    setCorrectedText(null);
    setTextStatus(undefined);
    setTranscriptionJobId(null);
    processedJobsRef.current = new Set();
  }, []);

  // Monitor transcription job - handles both transcription and correction phases
  // This effect has a large dependency array to ensure it responds to all relevant changes
  // Key considerations:
  // 1. Callback dependencies (onTranscribed, onCorrectionComplete) must be stable from parent
  // 2. State dependencies (rawText, correctedText) are needed for correction logic
  // 3. Job data changes (status, response, error) trigger processing
  useEffect(() => {
    let isCurrentJobEffect = true; // Flag for this effect instance
    // Keep local reference to the job ID to avoid closure issues
    const currentJobIdBeingProcessed = transcriptionJobId;

    if (!currentJobIdBeingProcessed || !transcriptionJobData) {
      return () => {
        isCurrentJobEffect = false;
      };
    }

    // Process the job directly without reconstruction - trust the backend data
    const jobProcessingResult = processBackgroundJob(
      transcriptionJobData || undefined,
      processedJobsRef.current
    );

    if (jobProcessingResult.processed) {
      if (!isCurrentJobEffect || currentJobIdBeingProcessed !== transcriptionJobId) {
        // This effect is for a stale job, ignore its result
        return;
      }
      
      // eslint-disable-next-line no-console
      console.log(
        `[VoiceRecording] Processed job ${currentJobIdBeingProcessed} with status: ${jobProcessingResult.status}`
      );

      try {
        // Access job properties safely with optional chaining
        const taskType = transcriptionJobData?.taskType;
        const status = transcriptionJobData?.status;

        // Handle completed job
        if (JOB_STATUSES.COMPLETED.includes(status as JobStatus)) {
          const responseText = jobProcessingResult.text;

          if (!responseText?.trim()) {
            console.warn(`[VoiceRecording] Completed job has no text response`);
            if (isMountedRef.current) {
              updateState({
                error: "Transcription completed but no text was received. Please try again.",
                isProcessing: false,
              });
              setTextStatus("error");
              setTranscriptionJobId(null);
            }
            return;
          }

          // Handle based on task type
          if (taskType === "text_correction") {
            // This is a correction job
            // eslint-disable-next-line no-console
            console.log(
              `[VoiceRecording] Correction completed with text length: ${responseText.length}`
            );

            // Only update state if component is still mounted
            if (!isMountedRef.current) return;
            
            // Set corrected text
            setCorrectedText(responseText);

            // If we don't have raw text for some reason, use the same text
            if (!rawText) {
              setRawText(responseText);
            }

            // Notify correction complete callback using stable ref
            if (callbacksRef.current.onCorrectionComplete && rawText) {
              callbacksRef.current.onCorrectionComplete(rawText, responseText);
            }

            // Notify transcribed callback with corrected text using stable ref
            if (callbacksRef.current.onTranscribed) {
              callbacksRef.current.onTranscribed(responseText);
            }

            // Mark as done and cleanup
            setTextStatus("done");
            setTranscriptionJobId(null);
            updateState({ isProcessing: false });
          } else if (taskType === "voice_transcription") {
            // This is a transcription job
            // eslint-disable-next-line no-console
            console.log(
              `[VoiceRecording] Transcription completed with text length: ${responseText.length}`
            );

            // Only update state if component is still mounted
            if (!isMountedRef.current) return;
            
            // Set raw text
            setRawText(responseText);

            if (autoCorrect && responseText.trim()) {
              // Start correction
              // eslint-disable-next-line no-console
              console.log(`[VoiceRecording] Auto-correcting text`);
              setTextStatus("loading");

              // Call correction handler, which will create a new job or modify existing one
              handleCorrection(
                responseText,
                sessionId,
                currentJobIdBeingProcessed,
                projectDirectory ?? undefined
              )
                .then((correctionResult) => {
                  if (correctionResult.isSuccess) {
                    if (typeof correctionResult.data === "string") {
                      // Direct text response from correction
                      setCorrectedText(correctionResult.data);
                      if (callbacksRef.current.onCorrectionComplete) {
                        callbacksRef.current.onCorrectionComplete(
                          responseText,
                          correctionResult.data
                        );
                      }
                      if (callbacksRef.current.onTranscribed) {
                        callbacksRef.current.onTranscribed(correctionResult.data);
                      }
                      setTextStatus("done");
                      setTranscriptionJobId(null);
                      updateState({ isProcessing: false });
                    } else if (
                      typeof correctionResult.data === "object" &&
                      correctionResult.data &&
                      "isBackgroundJob" in correctionResult.data &&
                      "jobId" in correctionResult.data
                    ) {
                      // Correction submitted as background job, update job ID to track the correction job
                      const newJobId = correctionResult.data.jobId;
                      console.log(`[VoiceRecording] Switching to monitor correction job: ${newJobId}`);
                      setTranscriptionJobId(newJobId);
                    }
                    // If background job, it will be picked up in the next useEffect cycle
                  } else {
                    // Correction creation failed but we have raw text
                    console.warn(
                      `[VoiceRecording] Correction failed: ${correctionResult.message}`
                    );
                    if (callbacksRef.current.onTranscribed) {
                      callbacksRef.current.onTranscribed(responseText);
                    }
                    // Update error state to reflect the correction failure
                    const errorMessage = getErrorMessage(`Correction failed: ${correctionResult.message || "Unknown error"}`, 'transcription');
                    updateState({ 
                      error: errorMessage,
                      isProcessing: false 
                    });
                    setTextStatus("done"); // Processing is finished, error state handles the failure
                    setTranscriptionJobId(null);
                  }
                })
                .catch((error) => {
                  console.error(
                    "[VoiceRecording] Error during correction:",
                    error
                  );
                  if (callbacksRef.current.onTranscribed) {
                    callbacksRef.current.onTranscribed(responseText);
                  }
                  // Update error state to reflect the correction failure
                  const errorMessage = getErrorMessage(`Correction failed: ${getErrorMessage(error)}`, 'transcription');
                  updateState({ 
                    error: errorMessage,
                    isProcessing: false 
                  });
                  setTextStatus("done"); // Processing is finished, error state handles the failure
                  setTranscriptionJobId(null);
                });
            } else {
              // No correction needed
              if (callbacksRef.current.onTranscribed) {
                callbacksRef.current.onTranscribed(responseText);
              }
              if (isMountedRef.current) {
                setTextStatus("done");
                setTranscriptionJobId(null);
                updateState({ isProcessing: false });
              }
            }
          } else {
            // Unknown task type but has text, treat as generic transcription
            // eslint-disable-next-line no-console
            console.log(
              `[VoiceRecording] Job completed with unknown task type: ${taskType}`
            );
            setRawText(responseText);
            if (callbacksRef.current.onTranscribed) {
              callbacksRef.current.onTranscribed(responseText);
            }
            setTextStatus("done");
            setTranscriptionJobId(null);
            updateState({ isProcessing: false });
          }
        }
        // Handle failed job
        else if (JOB_STATUSES.FAILED.includes(status as JobStatus)) {
          console.warn(
            `[VoiceRecording] Job ${currentJobIdBeingProcessed} failed: ${jobProcessingResult.error}`
          );

          // If we have already received raw text but correction failed, still consider success
          if (rawText && taskType === "text_correction") {
            // eslint-disable-next-line no-console
            console.log(
              `[VoiceRecording] Correction failed but using raw transcription`
            );
            if (callbacksRef.current.onTranscribed && !correctedText) {
              callbacksRef.current.onTranscribed(rawText);
            }
            setTextStatus("done");
          } else {
            // True error case
            const finalErrorMessage = jobProcessingResult.error || "Transcription job failed. Please try again.";
            updateState({
              error: finalErrorMessage,
              isProcessing: false,
            });
            setTextStatus("error");
          }

          setTranscriptionJobId(null);
        }
      } catch (error) {
        console.error("[VoiceRecording] Error processing job result:", error);
        updateState({ error: getErrorMessage(error, 'transcription'), isProcessing: false });
        setTextStatus("error");
        setTranscriptionJobId(null);
      }
    }
    // Handle active job states
    else if (transcriptionJobData) {
      if (!isCurrentJobEffect || currentJobIdBeingProcessed !== transcriptionJobId) {
        // This effect is for a stale job, ignore its result
        return;
      }
      
      const status = transcriptionJobData.status;

      // Check if job is in an active state
      if (status && JOB_STATUSES.ACTIVE.includes(status as JobStatus)) {
        setTextStatus("loading");
        setIsProcessing(true);
      }

      // Not processed but has a warning
      if (jobProcessingResult.error) {
        console.warn(
          `[VoiceRecording] Job warning: ${jobProcessingResult.error}`
        );
        // Don't update UI state for warnings, just log them
      }
    }
    
    return () => {
      isCurrentJobEffect = false; // Cleanup function for when effect re-runs or component unmounts
    };
  }, [
    // Primary job tracking dependencies
    transcriptionJobId, // Trigger when the ID of job to watch changes
    transcriptionJobData?.status, // Trigger when the status of the watched job changes
    transcriptionJobData?.response, // Trigger when the response of the watched job changes
    transcriptionJobData?.errorMessage, // Trigger on error message change
    transcriptionJobData?.taskType, // Trigger when task type changes
    
    // State dependencies used within the effect
    rawText, // Used in correction completion and fallback logic
    correctedText, // Used in onTranscribed callback condition
    
    // Configuration dependencies
    autoCorrect, // Affects whether correction is performed
    sessionId, // Used in correction handler calls
    projectDirectory, // Used in correction handler calls
    
    // Function dependencies (should be stable via useCallback)
    updateState, // Memoized above with [onError, setIsProcessing]
    setIsProcessing, // Passed from parent, should be stable
    
    // Note: onTranscribed and onCorrectionComplete are handled via callbacksRef
    // to prevent unnecessary effect re-runs when callbacks change
  ]);

  return {
    rawText,
    correctedText,
    textStatus,
    processTranscription,
    retryTranscription,
    resetTranscriptionState,
  };
}

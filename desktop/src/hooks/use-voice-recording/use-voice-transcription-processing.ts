"use client";

import { useState, useRef, useCallback, useEffect } from "react";

import { useBackgroundJobs } from "@/contexts/background-jobs/useBackgroundJobs";
import { type ActionState } from "@/types";
import { type BackgroundJob, type JobStatus } from "@/types/session-types";

import {
  handleTranscription,
  handleCorrection,
  processBackgroundJob,
  processDirectTranscriptionResult,
} from "./voice-transcription-handler";

interface UseVoiceTranscriptionProcessingProps {
  sessionId?: string | null;
  projectDirectory?: string;
  autoCorrect?: boolean;
  onTranscribed?: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void;
  onError: (error: string) => void;
  setIsProcessing: (isProcessing: boolean) => void;
}

export function useVoiceTranscriptionProcessing({
  sessionId = null,
  projectDirectory = "",
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

  // Get the background job from context
  const backgroundJobs = useBackgroundJobs();
  const transcriptionJob = transcriptionJobId ? { job: backgroundJobs.jobs.find(job => job.id === transcriptionJobId) } : null;

  // Unified function to update state
  const updateState = useCallback(
    (state: { error?: string | null; isProcessing?: boolean }) => {
      if (state.error !== undefined) {
        onError(state.error || "");
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
          updateState({
            error: result.message || "Failed to process voice recording",
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
              projectDirectory,
              setRawText,
              setCorrectedText,
              setTextStatus,
              updateState,
              onTranscribed,
              onCorrectionComplete
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
            projectDirectory,
            setRawText,
            setCorrectedText,
            setTextStatus,
            updateState,
            onTranscribed,
            onCorrectionComplete
          );
        }
      } catch (error) {
        console.error(
          "[VoiceRecording] Error processing transcription result:",
          error
        );
        updateState({
          error:
            error instanceof Error
              ? error.message
              : "Error processing recording",
          isProcessing: false,
        });
        setTextStatus("error");
      }
    },
    [
      updateState,
      autoCorrect,
      sessionId,
      transcriptionJobId,
      projectDirectory,
      onTranscribed,
      onCorrectionComplete,
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
          projectDirectory
        );

        // Process the result
        await processTranscriptionResult(result, false);
      } catch (err) {
        console.error("[VoiceRecording] Error in processTranscription:", err);
        updateState({
          error:
            err instanceof Error ? err.message : "Error processing recording",
          isProcessing: false,
        });
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
          projectDirectory
        );

        // Process the result
        await processTranscriptionResult(result, false);
      } catch (err) {
        console.error("[VoiceRecording] Error in retryTranscription:", err);
        updateState({
          error:
            err instanceof Error ? err.message : "Error processing recording",
          isProcessing: false,
        });
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
  useEffect(() => {
    // Keep local reference to the job ID to avoid closure issues
    const currentJobId = transcriptionJobId;

    if (!currentJobId || !transcriptionJob?.job) {
      return;
    }

    // Create a safer version of the job with proper type checking
    const safeJob: BackgroundJob = {
      id: typeof transcriptionJob.job.id === 'string' ? transcriptionJob.job.id : '',
      taskType: typeof transcriptionJob.job.taskType === 'string' ? transcriptionJob.job.taskType : 'unknown',
      status: typeof transcriptionJob.job.status === 'string' ? 
        (transcriptionJob.job.status as JobStatus) : 
        'idle' as JobStatus, // Default to 'idle' as a valid JobStatus
      apiType: 'openrouter', // Default value
      createdAt: Date.now(), // Current timestamp in ms
      prompt: typeof transcriptionJob.job.prompt === 'string' ? transcriptionJob.job.prompt : '',
      sessionId: typeof transcriptionJob.job.sessionId === 'string' ? transcriptionJob.job.sessionId : '',
      // Add other values from the job if available, with safe type checking
      response: typeof transcriptionJob.job.response === 'string' ? transcriptionJob.job.response : '',
      projectDirectory: typeof transcriptionJob.job.projectDirectory === 'string' ? transcriptionJob.job.projectDirectory : null,
      tokensSent: typeof transcriptionJob.job.tokensSent === 'number' ? transcriptionJob.job.tokensSent : null,
      tokensReceived: typeof transcriptionJob.job.tokensReceived === 'number' ? transcriptionJob.job.tokensReceived : null,
      errorMessage: typeof transcriptionJob.job.errorMessage === 'string' ? transcriptionJob.job.errorMessage : null,
    };
    
    const jobProcessingResult = processBackgroundJob(
      safeJob,
      processedJobsRef.current
    );

    if (jobProcessingResult.processed) {
      // eslint-disable-next-line no-console
      console.log(
        `[VoiceRecording] Processed job ${currentJobId} with status: ${jobProcessingResult.status}`
      );

      try {
        // Use the safe job object that we created above
        const taskType = safeJob.taskType;
        const status = safeJob.status;

        // Handle completed job
        if (status === "completed") {
          const responseText = jobProcessingResult.text;

          if (!responseText) {
            console.warn(`[VoiceRecording] Completed job has no text response`);
            updateState({
              error: "No text in completed job",
              isProcessing: false,
            });
            setTextStatus("error");
            setTranscriptionJobId(null);
            return;
          }

          // Handle based on task type
          if (taskType === "voice_correction") {
            // This is a correction job
            // eslint-disable-next-line no-console
            console.log(
              `[VoiceRecording] Correction completed with text length: ${responseText.length}`
            );

            // Set corrected text
            setCorrectedText(responseText);

            // If we don't have raw text for some reason, use the same text
            if (!rawText) {
              setRawText(responseText);
            }

            // Notify correction complete callback
            if (onCorrectionComplete && rawText) {
              onCorrectionComplete(rawText, responseText);
            }

            // Notify transcribed callback with corrected text
            if (onTranscribed) {
              onTranscribed(responseText);
            }

            // Mark as done and cleanup
            setTextStatus("done");
            setTranscriptionJobId(null);
            updateState({ isProcessing: false });
          } else if (taskType === "transcription") {
            // This is a transcription job
            // eslint-disable-next-line no-console
            console.log(
              `[VoiceRecording] Transcription completed with text length: ${responseText.length}`
            );

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
                currentJobId,
                projectDirectory
              )
                .then((correctionResult) => {
                  if (correctionResult.isSuccess) {
                    if (typeof correctionResult.data === "string") {
                      // Direct text response from correction
                      setCorrectedText(correctionResult.data);
                      if (onCorrectionComplete) {
                        onCorrectionComplete(
                          responseText,
                          correctionResult.data
                        );
                      }
                      if (onTranscribed) {
                        onTranscribed(correctionResult.data);
                      }
                      setTextStatus("done");
                      setTranscriptionJobId(null);
                      updateState({ isProcessing: false });
                    }
                    // If background job, it will be picked up in the next useEffect cycle
                  } else {
                    // Correction creation failed but we have raw text
                    console.warn(
                      `[VoiceRecording] Correction failed: ${correctionResult.message}`
                    );
                    if (onTranscribed) {
                      onTranscribed(responseText);
                    }
                    setTextStatus("done");
                    setTranscriptionJobId(null);
                    updateState({ isProcessing: false });
                  }
                })
                .catch((error) => {
                  console.error(
                    "[VoiceRecording] Error during correction:",
                    error
                  );
                  if (onTranscribed) {
                    onTranscribed(responseText);
                  }
                  setTextStatus("done");
                  setTranscriptionJobId(null);
                  updateState({ isProcessing: false });
                });
            } else {
              // No correction needed
              if (onTranscribed) {
                onTranscribed(responseText);
              }
              setTextStatus("done");
              setTranscriptionJobId(null);
              updateState({ isProcessing: false });
            }
          } else {
            // Unknown task type but has text, treat as generic transcription
            // eslint-disable-next-line no-console
            console.log(
              `[VoiceRecording] Job completed with unknown task type: ${taskType}`
            );
            setRawText(responseText);
            if (onTranscribed) {
              onTranscribed(responseText);
            }
            setTextStatus("done");
            setTranscriptionJobId(null);
            updateState({ isProcessing: false });
          }
        }
        // Handle failed job
        else if (status === "failed") {
          console.warn(
            `[VoiceRecording] Job ${currentJobId} failed: ${jobProcessingResult.error}`
          );

          // If we have already received raw text but correction failed, still consider success
          if (rawText && taskType === "voice_correction") {
            // eslint-disable-next-line no-console
            console.log(
              `[VoiceRecording] Correction failed but using raw transcription`
            );
            if (onTranscribed && !correctedText) {
              onTranscribed(rawText);
            }
            setTextStatus("done");
          } else {
            // True error case
            updateState({
              error: jobProcessingResult.error || "Job failed",
              isProcessing: false,
            });
            setTextStatus("error");
          }

          setTranscriptionJobId(null);
        }
      } catch (error) {
        console.error("[VoiceRecording] Error processing job result:", error);
        updateState({
          error:
            error instanceof Error ? error.message : "Error processing result",
          isProcessing: false,
        });
        setTextStatus("error");
        setTranscriptionJobId(null);
      }
    }
    // Handle active job states
    else if (safeJob) {
      const status = safeJob.status;

      // Check if job is in an active state
      const activeStates = [
        "running",
        "pending",
        "queued",
        "acknowledged_by_worker",
        "preparing",
        "generating_stream",
        "processing_stream",
      ];

      if (status && activeStates.includes(status)) {
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
  }, [
    transcriptionJobId,
    transcriptionJob,
    rawText,
    correctedText,
    onTranscribed,
    onCorrectionComplete,
    projectDirectory,
    sessionId,
    autoCorrect,
    updateState,
    setIsProcessing,
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

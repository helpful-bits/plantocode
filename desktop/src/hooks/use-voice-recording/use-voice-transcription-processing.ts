"use client";

import { useState, useRef, useCallback, useEffect } from "react";

import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { JOB_STATUSES, type JobStatus } from "@/types/session-types";
import { getErrorMessage } from "@/utils/error-handling";

function validateTranscriptionText(text: string | null): {
  isValid: boolean;
  reason?: string;
} {
  if (!text) {
    return { isValid: false, reason: "Transcription is empty" };
  }

  const trimmedText = text.trim();

  if (trimmedText.length < 3) {
    return { isValid: false, reason: "Transcription is too short" };
  }

  if (
    trimmedText.includes("Error:") &&
    (trimmedText.includes("API") || trimmedText.includes("failed")) &&
    trimmedText.length < 100
  ) {
    return { isValid: false, reason: "Transcription contains error message" };
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(trimmedText)) {
    return {
      isValid: false,
      reason: "Transcription appears to be an ID, not text",
    };
  }

  if (
    (trimmedText.startsWith("{") && trimmedText.endsWith("}")) ||
    (trimmedText.startsWith("[") && trimmedText.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmedText);
      return {
        isValid: false,
        reason: "Transcription appears to be unparsed JSON",
      };
    } catch (_e) {
    }
  }

  if (trimmedText.includes("undefined") && trimmedText.length < 20) {
    return {
      isValid: false,
      reason: "Transcription contains programming artifact",
    };
  }

  if (trimmedText.includes("<ERROR>") || trimmedText.includes("[ERROR]")) {
    return { isValid: false, reason: "Transcription contains error marker" };
  }

  return { isValid: true };
}

function processBackgroundJob(
  job: any | undefined,
  processedJobs: Set<string>
): {
  processed: boolean;
  text: string | null;
  error: string | null;
  status: "completed" | "failed" | "processing";
} {
  if (!job || processedJobs.has(job.id)) {
    return { processed: false, text: null, error: null, status: "processing" };
  }

  console.debug(
    `[processBackgroundJob] Processing job ${job.id} with status ${job.status}`
  );

  if (JOB_STATUSES.COMPLETED.includes(job.status)) {
    processedJobs.add(job.id);

    let text = job.response || null;
    console.debug(
      `[processBackgroundJob] Job ${job.id} has ${text ? "response of length " + text.length : "no response"}`
    );

    if (text) {
      text = text
        .replace(/^"(.*)"$/, "$1") // Remove surrounding quotes if present
        .replace(/\\n/g, "\n") // Replace escaped newlines with actual newlines
        .replace(/\\"/g, '"');

      if (job.taskType === "text_correction") {
        text = text
          .replace(/^Corrected text:\s+/i, "") // Remove "Corrected text:" prefix
          .replace(/^Here's the corrected text:\s+/i, "");
      }

      const validation = validateTranscriptionText(text);
      if (!validation.isValid) {
        console.warn(
          `[processBackgroundJob] Invalid text content in job ${job.id}: ${validation.reason}`
        );
        return {
          processed: true,
          text: null,
          error: `Invalid content: ${validation.reason}`,
          status: "failed",
        };
      }
    } else {
      console.warn(
        `[processBackgroundJob] Completed job ${job.id} has no response content`
      );
    }

    return {
      processed: true,
      text,
      error: null,
      status: "completed",
    };
  }

  if (JOB_STATUSES.FAILED.includes(job.status)) {
    processedJobs.add(job.id);

    const errorMessage =
      job.errorMessage ||
      (job.status === "canceled"
        ? "Operation was canceled"
        : "Operation failed");

    console.debug(
      `[processBackgroundJob] Job ${job.id} failed with error: ${errorMessage}`
    );

    return {
      processed: true,
      text: null,
      error: errorMessage,
      status: "failed",
    };
  }

  if (job.status === "running" && job.startTime) {
    const runningTimeMs = Date.now() - job.startTime;
    const MAX_RUNNING_TIME = 5 * 60 * 1000;

    if (runningTimeMs > MAX_RUNNING_TIME) {
      console.warn(
        `[processBackgroundJob] Job ${job.id} has been running for ${Math.round(runningTimeMs / 1000)}s, may be stuck`
      );
      return {
        processed: false,
        text: null,
        error: "Job is taking longer than expected",
        status: "processing",
      };
    }
  }

  return {
    processed: false,
    text: null,
    error: null,
    status: "processing",
  };
}

interface UseVoiceTranscriptionProcessingProps {
  sessionId?: string | null;
  projectDirectory?: string | null;
  autoCorrect?: boolean;
  languageCode?: string;
  onTranscribed?: (text: string) => void;
  onCorrectionComplete?: (rawText: string, correctedText: string) => void;
  onError: (error: string) => void;
  setIsProcessing: (isProcessing: boolean) => void;
}

export function useVoiceTranscriptionProcessing({
  sessionId = null,
  projectDirectory = null,
  autoCorrect = true,
  languageCode = "en",
  onTranscribed,
  onCorrectionComplete,
  onError,
  setIsProcessing,
}: UseVoiceTranscriptionProcessingProps) {
  const [rawText, setRawText] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [textStatus, setTextStatus] = useState<
    "loading" | "done" | "error" | undefined
  >(undefined);

  const [correctionJobId, setCorrectionJobId] = useState<string | null>(null);

  const processedJobsRef = useRef<Set<string>>(new Set());
  
  const isMountedRef = useRef(true);
  
  const callbacksRef = useRef({ onTranscribed, onCorrectionComplete });
  
  useEffect(() => {
    callbacksRef.current = { onTranscribed, onCorrectionComplete };
  }, [onTranscribed, onCorrectionComplete]);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { job: correctionJobData } = useBackgroundJob(correctionJobId);

  const updateState = useCallback(
    (state: { error?: string | null; isProcessing?: boolean }) => {
      if (!isMountedRef.current) return;
      
      if (state.error) {
        onError(state.error);
      }
      if (state.isProcessing !== undefined) {
        setIsProcessing(state.isProcessing);
      }
    },
    [onError, setIsProcessing]
  );

  const startTranscriptionStream = useCallback(() => {
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    
    const processStream = async () => {
      try {
        // Collect all chunks from the stream first
        const chunks: Uint8Array[] = [];
        const reader = stream.readable.getReader();
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        
        // Convert chunks to blob
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        
        const audioBlob = new Blob([combined], { type: "audio/webm" });
        
        // Use blob-based transcription (which uses FormData, not ReadableStream)
        const { transcribeAudioBlob } = await import(
          "@/actions/voice-transcription/transcribe"
        );
        
        const result = await transcribeAudioBlob(audioBlob, Date.now(), languageCode);
        
        if (isMountedRef.current) {
          setRawText(result.text);
          
          if (!autoCorrect) {
            callbacksRef.current.onTranscribed?.(result.text);
            setTextStatus("done");
            updateState({ isProcessing: false });
          } else {
            // Insert raw text first, then start correction
            callbacksRef.current.onTranscribed?.(result.text);
            
            // Handle correction logic here
            const { createTextCorrectionJobAction } = await import(
              "@/actions/voice-transcription/index"
            );
            
            const correctionResult = await createTextCorrectionJobAction(
              result.text,
              sessionId || "",
              null,
              projectDirectory ?? undefined
            );
            
            if (
              correctionResult.isSuccess &&
              typeof correctionResult.data === "object" &&
              correctionResult.data &&
              "jobId" in correctionResult.data
            ) {
              setCorrectionJobId(correctionResult.data.jobId);
            } else {
              setTextStatus("done");
              updateState({
                isProcessing: false,
                error: "Could not auto-correct text. Using original transcription.",
              });
            }
          }
        }
      } catch (error) {
        console.error("[VoiceRecording] Error in stream processing:", error);
        updateState({ error: getErrorMessage(error, 'transcription'), isProcessing: false });
        setTextStatus("error");
      }
    };
    
    const resultPromise = processStream();
    
    return {
      writableStream: stream.writable,
      resultPromise,
    };
  }, [sessionId, projectDirectory, autoCorrect, updateState]);

  

  const resetTranscriptionState = useCallback(() => {
    setRawText(null);
    setCorrectedText(null);
    setTextStatus(undefined);
    setCorrectionJobId(null);
    processedJobsRef.current.clear();
  }, []);

  useEffect(() => {
    if (!correctionJobId || !correctionJobData) {
      return;
    }

    const jobProcessingResult = processBackgroundJob(
      correctionJobData,
      processedJobsRef.current
    );

    if (!jobProcessingResult.processed) {
      if (correctionJobData.status && JOB_STATUSES.ACTIVE.includes(correctionJobData.status as JobStatus)) {
        setTextStatus("loading");
        setIsProcessing(true);
      }
      return;
    }

    if (!isMountedRef.current) return;

    try {
      const status = correctionJobData.status as JobStatus;

      if (JOB_STATUSES.COMPLETED.includes(status)) {
        const responseText = jobProcessingResult.text;

        if (!responseText?.trim()) {
          updateState({
            error: "Text correction completed but no text was received. Using original transcription.",
            isProcessing: false,
          });
          if (rawText) callbacksRef.current.onTranscribed?.(rawText);
          setTextStatus("done");
        } else {
          setCorrectedText(responseText);
          if (callbacksRef.current.onCorrectionComplete && rawText) {
            callbacksRef.current.onCorrectionComplete(rawText, responseText);
          }
          setTextStatus("done");
          updateState({ isProcessing: false });
        }
      } else if (JOB_STATUSES.FAILED.includes(status)) {
        const finalErrorMessage = jobProcessingResult.error || "Text correction failed. Please try again.";
        
        if (rawText) {
          callbacksRef.current.onTranscribed?.(rawText);
          setTextStatus("done");
          updateState({
            isProcessing: false,
            error: `Correction failed: ${finalErrorMessage}. Using original transcription.`,
          });
        } else {
          updateState({
            error: finalErrorMessage,
            isProcessing: false,
          });
          setTextStatus("error");
        }
      }
    } catch (error) {
      updateState({ error: getErrorMessage(error, 'transcription'), isProcessing: false });
      setTextStatus("error");
    } finally {
      setCorrectionJobId(null);
    }
  }, [
    correctionJobId,
    correctionJobData,
    rawText,
    updateState,
    setIsProcessing,
  ]);

  return {
    rawText,
    correctedText,
    textStatus,
    startTranscriptionStream,
    resetTranscriptionState,
  };
}
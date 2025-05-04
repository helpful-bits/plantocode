"use server";

import { ActionState, ApiType } from "@/types";
import { backgroundJobRepository } from "@/lib/db/repositories";
import { WHISPER_MAX_FILE_SIZE_MB, WHISPER_MODEL } from '@/lib/constants';
import { createBackgroundJob, updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '@/lib/jobs/job-helpers';

/**
 * Transcribe a voice recording from a Blob using Groq's Whisper implementation
 */
export async function transcribeVoiceAction(
  audioBlob: Blob,
  language: string = "en",
  sessionId: string | null = ""
): Promise<ActionState<{ text: string; jobId: string }>> {
  try {
    console.log(`[Voice Transcription] Processing audio blob (${audioBlob?.size || 'unknown'} bytes) with sessionId: ${sessionId || 'none'}`);
    
    if (!audioBlob) {
      console.error("[Voice Transcription] No audio blob provided");
      return {
        isSuccess: false,
        message: "No audio data was provided",
        data: { text: "", jobId: "" }
      };
    }

    // Check if audio file is too large
    const fileSizeMB = audioBlob.size / (1024 * 1024);
    if (fileSizeMB > WHISPER_MAX_FILE_SIZE_MB) {
      return {
        isSuccess: false,
        message: `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${WHISPER_MAX_FILE_SIZE_MB}MB.`,
        data: { text: "", jobId: "" }
      };
    }

    // Use a default session ID if none provided
    // This is important because the database requires a non-null value
    const effectiveSessionId = sessionId || `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Validate that effectiveSessionId is always a string
    if (typeof effectiveSessionId !== 'string' || !effectiveSessionId.trim()) {
      console.error(`[Voice Transcription] Invalid effectiveSessionId: ${typeof effectiveSessionId}, value: ${effectiveSessionId}`);
      return {
        isSuccess: false,
        message: "Invalid session ID for background job creation",
        data: { text: "", jobId: "" }
      };
    }
    
    // Create a background job for tracking using centralized helper
    const runningJob = await createBackgroundJob(
      effectiveSessionId,
      {
        apiType: "groq",
        taskType: "transcription",
        model: WHISPER_MODEL,
        rawInput: `Audio blob transcription request (${(audioBlob.size / 1024).toFixed(1)} KB)`,
        includeSyntax: false,
        temperature: 0.0
      }
    );

    console.log(`[Voice Transcription] Created background job: ${runningJob.id} for session: ${effectiveSessionId}`);

    // Fetch session data to use in tracking if a real session was provided
    if (sessionId) {
      try {
        const session = await backgroundJobRepository.getSession(sessionId);
        if (!session) {
          console.warn(`[Voice Transcription] Session ${sessionId} not found, proceeding without session context`);
        } else {
          console.log(`[Voice Transcription] Found session ${sessionId} for the job`);
        }
      } catch (error) {
        console.warn(`[Voice Transcription] Error fetching session ${sessionId}:`, error);
      }
    }

    // Update job to running
    await updateJobToRunning(runningJob.id, 'groq');

    // Create form data for the Groq Whisper API
    const form = new FormData();
    
    // Determine the file extension based on blob's mime type or default to webm
    const mimeType = audioBlob.type.split(';')[0].toLowerCase();
    const extensionMap: Record<string, string> = {
      "audio/flac": "flac",
      "audio/mp3": "mp3", 
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/mpga": "mp3",
      "audio/m4a": "m4a",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/x-wav": "wav"
    };
    
    const extension = extensionMap[mimeType] || "webm";
    const filename = `audio-${Date.now()}.${extension}`;
    
    // Append the necessary data to the form
    form.append("file", audioBlob, filename);
    form.append("model", WHISPER_MODEL);
    form.append("temperature", "0.0");
    form.append("response_format", "json");
    form.append("language", language);

    // Prepare API request to Groq's Whisper API
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: form
    });

    // Log API request to background job
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId: runningJob.id,
      status: 'running',
      statusMessage: `Sent request to Groq Whisper API (${new Date().toISOString()})`
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Voice Transcription] Groq API error: ${response.status} - ${errorText}`);
      
      // Update job to failed
      await updateJobToFailed(runningJob.id, `Groq API error: ${response.status} - ${errorText}`);
      
      return {
        isSuccess: false,
        message: `Transcription failed: ${errorText}`,
        data: { text: "", jobId: runningJob.id },
        error: new Error(`Groq API error: ${response.status} - ${errorText}`)
      };
    }

    // Get the text from the response
    const result = await response.json();
    const text = result.text;
    console.log(`[Voice Transcription] Transcription completed: ${text?.substring(0, 100)}...`);

    // Update job to completed
    await updateJobToCompleted(runningJob.id, text);

    // Return results with the job ID for tracking
    return {
      isSuccess: true,
      message: "Transcription completed",
      data: { text, jobId: runningJob.id }
    };
  } catch (error) {
    console.error("[Voice Transcription] Error:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Transcription failed",
      data: { text: "", jobId: "" }
    };
  }
} 
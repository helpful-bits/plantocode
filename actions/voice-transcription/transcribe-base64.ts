"use server";

import { ActionState, ApiType } from "@/types";
import { backgroundJobRepository } from "@/lib/db/repositories";
import { WHISPER_MAX_FILE_SIZE_MB, WHISPER_MODEL } from '@/lib/constants';
import { createBackgroundJob, updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '@/lib/jobs/job-helpers';

/**
 * Transcribe audio data from a base64-encoded string using Groq's Whisper implementation
 */
export async function transcribeAudioAction(
  base64Audio: string,
  language: string = "en",
  sessionId: string,
  projectDirectory: string
): Promise<ActionState<{ text: string; jobId: string }>> {
  try {
    if (!base64Audio) {
      console.error("[Voice Transcription] No base64 audio data provided");
      return {
        isSuccess: false,
        message: "No audio data was provided",
        data: { text: "", jobId: "" }
      };
    }

    // Add strict validation for the sessionId parameter
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error("Invalid session ID for audio transcription");
    }

    console.log(`[Voice Transcription] Processing base64 audio (${Math.round(base64Audio.length / 1024)} KB)`);

    // Check if audio file is too large
    const fileSizeMB = base64Audio.length / (1024 * 1024 * 1.33); // Approximate size accounting for base64 overhead
    if (fileSizeMB > WHISPER_MAX_FILE_SIZE_MB) {
      return {
        isSuccess: false,
        message: `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${WHISPER_MAX_FILE_SIZE_MB}MB.`,
        data: { text: "", jobId: "" }
      };
    }

    // Create a background job for tracking using centralized helper
    const runningJob = await createBackgroundJob(
      sessionId,
      {
        apiType: "groq",
        taskType: "transcription",
        model: WHISPER_MODEL,
        rawInput: `Audio transcription request (${Math.round(base64Audio.length / 1024)} KB)`,
        includeSyntax: false,
        temperature: 0.0
      },
      projectDirectory
    );

    // Fetch session data to use in tracking
    const session = await backgroundJobRepository.getSession(sessionId);
    if (!session) {
      console.warn(`[Voice Transcription] Session ${sessionId} not found, proceeding without session context`);
    }

    // Update job status to running
    await updateJobToRunning(runningJob.id, 'groq');

    // Remove data:audio/whatever;base64, prefix if present
    const cleanBase64 = base64Audio.includes("base64,") 
      ? base64Audio.split("base64,")[1] 
      : base64Audio;
    
    // Convert base64 to binary
    const binaryData = Buffer.from(cleanBase64, 'base64');
    
    // Create form data
    const form = new FormData();
    
    // Create a Blob from the binary data
    // Attempt to detect the mime type from the base64 prefix
    let mimeType = 'audio/wav'; // Default
    if (base64Audio.includes('data:')) {
      const mimeMatch = base64Audio.match(/data:([^;]+);/);
      if (mimeMatch && mimeMatch[1]) {
        mimeType = mimeMatch[1];
      }
    }
    
    const blob = new Blob([binaryData], { type: mimeType });
    
    // Determine file extension
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
    
    const extension = extensionMap[mimeType] || "wav";
    const filename = `audio-${Date.now()}.${extension}`;
    
    // Append the necessary data to the form
    form.append("file", blob, filename);
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
      status: "running",
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
        data: { text: "", jobId: runningJob.id }
      };
    }

    // Get the text from the response
    const result = await response.json();
    const text = result.text;
    console.log(`[Voice Transcription] Transcription completed: ${text.substring(0, 100)}...`);

    // Update job to completed
    await updateJobToCompleted(runningJob.id, text);

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
"use server";

import { ActionState } from "@/types"; // Keep ActionState import
import { sessionRepository } from '@/lib/db/repository-factory';
import { setupDatabase } from '@/lib/db';
import { safeFetch } from '@/lib/utils';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';

/**
 * Transcribe audio using Groq's Whisper API with background job tracking
 */
export async function transcribeAudioAction(
  audioBase64: string,
  sessionId?: string,
  options?: {
    model?: string;
    maxOutputTokens?: number;
    languageCode?: string;
    projectDirectory?: string;
  }
): Promise<ActionState<string>> {
  await setupDatabase();
  
  if (!audioBase64) {
    return { isSuccess: false, message: "No audio data provided" };
  }

  // Default settings
  let model = options?.model || "whisper-large-v3";
  let maxOutputTokens = options?.maxOutputTokens || 4096;
  const languageCode = options?.languageCode || "en";
  
  // Get project settings if projectDirectory is provided
  if (options?.projectDirectory) {
    try {
      const projectSettings = await getModelSettingsForProject(options.projectDirectory);
      
      // Apply transcription settings if available
      if (projectSettings?.transcription) {
        const transcriptionSettings = projectSettings.transcription;
        
        // Use project settings unless explicitly overridden
        if (!options.model && transcriptionSettings.model) {
          model = transcriptionSettings.model;
        }
        
        if (!options.maxOutputTokens && transcriptionSettings.maxTokens) {
          maxOutputTokens = transcriptionSettings.maxTokens;
        }
      }
    } catch (error) {
      console.warn("Failed to load project settings for transcription:", error);
      // Continue with defaults if we can't load project settings
    }
  } else if (sessionId) {
    // If no project directory but session ID is available, get it from the session
    try {
      const session = await sessionRepository.getSession(sessionId);
      if (session?.projectDirectory) {
        const projectSettings = await getModelSettingsForProject(session.projectDirectory);
        
        // Apply transcription settings if available
        if (projectSettings?.transcription) {
          const transcriptionSettings = projectSettings.transcription;
          
          // Use project settings unless explicitly overridden
          if (!options?.model && transcriptionSettings.model) {
            model = transcriptionSettings.model;
          }
          
          if (!options?.maxOutputTokens && transcriptionSettings.maxTokens) {
            maxOutputTokens = transcriptionSettings.maxTokens;
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load session or project settings for transcription:", error);
      // Continue with defaults if we can't load project settings
    }
  }
  
  // Create a background job if session ID is provided
  let job = null;
  if (sessionId) {
    try {
      job = await sessionRepository.createBackgroundJob(
        sessionId,
        "Audio transcription request",
        'whisper',
        'transcription',
        model,
        maxOutputTokens
      );
      
      // Update to preparing status
      await sessionRepository.updateBackgroundJobStatus(
        job.id,
        'preparing',
        null,
        null,
        null,
        'Setting up audio transcription'
      );
    } catch (error) {
      console.error("Error creating transcription background job:", error);
      // Continue without job tracking if creation fails
    }
  }
  
  try {
    // Update job status to running if we have a job
    if (job) {
      await sessionRepository.updateBackgroundJobStatus(
        job.id,
        'running',
        Date.now(),
        null,
        null,
        'Processing audio with Groq Whisper API'
      );
    }
    
    // Validate API key
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      if (job) {
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'failed',
          null,
          Date.now(),
          null,
          'Groq API key not configured'
        );
      }
      return { isSuccess: false, message: "Groq API key not configured" };
    }
    
    // Remove data:audio/whatever;base64, prefix if present
    const base64Data = audioBase64.includes("base64,") 
      ? audioBase64.split("base64,")[1] 
      : audioBase64;
    
    // Prepare binary data
    const binaryData = Buffer.from(base64Data, 'base64');
    
    // Create form data for the API request
    const formData = new FormData();
    const blob = new Blob([binaryData], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', model);
    formData.append('temperature', '0.0');
    formData.append('response_format', 'json');
    formData.append('language', languageCode);
    
    // Call the Groq Whisper API
    const response = await safeFetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      if (job) {
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'failed',
          null,
          Date.now(),
          null,
          `Groq API error (${response.status}): ${errorText.substring(0, 500)}`
        );
      }
      
      if (response.status === 401) {
        throw new Error("Authentication error with transcription service. Please check API key configuration.");
      }
      
      throw new Error(`Transcription service error (${response.status}): ${errorText.substring(0, 100)}...`);
    }
    
    // Process the response
    const data = await response.json();
    
    // Validate transcription
    if (!data?.text || data.text.trim() === '') {
      if (job) {
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'failed',
          null,
          Date.now(),
          null,
          'Empty transcription received'
        );
      }
      return { isSuccess: false, message: "No transcription text in response. Please try again with a clearer recording." };
    }
    
    // Update job status to completed if we have a job
    if (job) {
      await sessionRepository.updateBackgroundJobStatus(
        job.id,
        'completed',
        null,
        Date.now(),
        null,
        'Successfully transcribed audio',
        {
          tokensReceived: Math.ceil(data.text.length / 4), // Rough token estimate
          charsReceived: data.text.length
        }
      );
    }
    
    return { 
      isSuccess: true, 
      message: "Voice transcribed successfully", 
      data: data.text
    };
  } catch (error) {
    console.error("Error in audio transcription:", error);
    
    // Update job status to failed if we have a job
    if (job) {
      await sessionRepository.updateBackgroundJobStatus(
        job.id,
        'failed',
        null,
        Date.now(),
        null,
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
    
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Unknown error during transcription" 
    };
  }
}

/**
 * Transcribes audio from a blob
 */
export async function transcribeVoiceAction(request: {
  blob: Blob;
  mimeType: string;
  languageCode?: string; // Optional language code
  sessionId?: string | null; // Session ID parameter for background job tracking
}): Promise<ActionState<string>> {
  try {
    await setupDatabase();
    
    if (!request.blob || request.blob.size === 0) {
      console.error("Empty audio blob received");
      return {
        isSuccess: false,
        message: "Empty audio recording received. Please try again with a valid recording.",
      };
    }
    
    // Create a background job if session ID is provided
    let job = null;
    if (request.sessionId) {
      try {
        job = await sessionRepository.createBackgroundJob(
          request.sessionId,
          "Voice recording transcription",
          'whisper',
          'transcription',
          "whisper-large-v3",
          4096
        );
        
        // Update to preparing status
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'preparing',
          null,
          null,
          null,
          'Setting up voice transcription'
        );
      } catch (error) {
        console.error("Error creating voice transcription background job:", error);
        // Continue without job tracking if creation fails
      }
    }
    
    // Update job status to running if we have a job
    if (job) {
      await sessionRepository.updateBackgroundJobStatus(
        job.id,
        'running',
        Date.now(),
        null,
        null,
        'Processing voice recording with Groq Whisper API'
      );
    }
    
    const form = new FormData();

    const normalizedMimeType = request.mimeType.split(';')[0].toLowerCase();
    
    const extensionMap: Record<string, string> = {
      "audio/flac": "flac",
      "audio/mp3": "mp3", 
      "audio/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/mpga": "mp3",
      "audio/m4a": "m4a",
      "audio/ogg": "ogg",
      "audio/opus": "opus",
      "audio/wav": "wav",
      "audio/webm": "webm",
      "audio/x-wav": "wav"
    };
    
    const extension = extensionMap[normalizedMimeType] || "webm"; // Default to webm if type unknown
    const filename = `audio-${Date.now()}.${extension}`;
    
    form.append("file", request.blob, filename);
    form.append("model", "whisper-large-v3"); // Use standard Whisper model
    form.append("temperature", "0.0");
    form.append("response_format", "json");
    form.append("language", request.languageCode || "en");
    
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY is not defined");
      if (job) {
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'failed',
          null,
          Date.now(),
          null,
          'Groq API key not configured'
        );
      }
      return {
        isSuccess: false,
        message: "Transcription service configuration error. Please contact support.",
      };
    }

    const response = await safeFetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: form
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Groq API error (${response.status}): ${errText}`);
      
      if (job) {
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'failed',
          null,
          Date.now(),
          null,
          `Groq API error (${response.status}): ${errText.substring(0, 100)}...`
        );
      }
      
      if (response.status === 401) {
        return {
          isSuccess: false,
          message: "Authentication error with transcription service. Please check API key configuration.",
        };
      }
      
      return {
        isSuccess: false,
        message: `Transcription service error (${response.status}): ${errText.substring(0, 100)}...`,
      };
    }

    const data = await response.json();
    if (!data?.text) {
      console.error("Empty transcription result", data);
      if (job) {
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'failed',
          null,
          Date.now(),
          null,
          'Empty transcription received'
        );
      }
      return {
        isSuccess: false,
        message: "No transcription text in response. Please try again with a clearer recording.",
      };
    }

    // Update job status to completed if we have a job
    if (job) {
      await sessionRepository.updateBackgroundJobStatus(
        job.id,
        'completed',
        null,
        Date.now(),
        null,
        'Successfully transcribed voice recording',
        {
          tokensReceived: Math.ceil(data.text.length / 4), // Rough token estimate
          charsReceived: data.text.length
        }
      );
    }

    return <ActionState<string>>{
      isSuccess: true,
      message: "Voice transcribed successfully",
      data: data.text,
    };
  } catch (error: unknown) {
    console.error("Error transcribing voice:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    // Update job status to failed if applicable
    if (request.sessionId) {
      try {
        const jobs = await sessionRepository.findBackgroundJobsBySessionId(
          request.sessionId,
          { limit: 1, status: 'running', type: 'transcription' }
        );
        
        if (jobs.length > 0) {
          await sessionRepository.updateBackgroundJobStatus(
            jobs[0].id,
            'failed',
            null,
            Date.now(),
            null,
            `Error: ${errorMessage}`
          );
        }
      } catch (err) {
        console.error("Failed to update job status:", err);
      }
    }
    
    return {
      isSuccess: false,
      message: `Failed to transcribe voice: ${errorMessage}`,
    };
  }
}

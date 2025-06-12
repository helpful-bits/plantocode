import { invoke } from "@tauri-apps/api/core";
import { type ActionState } from "@/types";
import { getErrorMessage, logError } from "@/utils/error-handling";
import { convertFileToBase64 } from "@/utils/file-binary-utils";
export async function transcribeAudioChunk(
  audioChunk: Blob,
  chunkIndex: number,
  sessionId: string,
  language?: string,
  prompt?: string,
  temperature?: number
): Promise<{ text: string; chunkIndex: number; processingTimeMs?: number }> {
  try {
    if (!audioChunk) {
      const errorMsg = "No audio chunk was provided";
      await logError(new Error(errorMsg), "Voice Transcription - Missing Audio Chunk");
      throw new Error(errorMsg);
    }

    if (!sessionId) {
      throw new Error("Session ID is required for transcription");
    }

    // Validate transcription parameters
    if (temperature !== undefined && (temperature < 0 || temperature > 1)) {
      throw new Error("Temperature must be between 0 and 1");
    }

    if (prompt !== undefined && prompt.trim().length > 1000) {
      throw new Error("Prompt must be 1000 characters or less");
    }

    // Convert audio chunk to base64
    const audioBase64 = await convertFileToBase64(audioChunk);

    // Use the batch transcription command
    const result = await invoke<{
      chunkIndex: number;
      text: string;
      processingTimeMs?: number;
    }>("transcribe_audio_batch_command", {
      sessionId,
      audioBase64,
      chunkIndex,
      durationMs: 5000,
      language: language === "en" ? null : language,
      prompt: prompt || null,
      temperature: temperature !== undefined ? temperature : null,
    });

    return {
      text: result.text || "",
      chunkIndex: result.chunkIndex,
      processingTimeMs: result.processingTimeMs,
    };
  } catch (error) {
    await logError(error, "transcribeAudioChunk", { chunkIndex, sessionId, hasPrompt: !!prompt, temperature });
    
    // Provide more specific error messages based on error type
    if (error instanceof Error) {
      if (error.message.includes("NetworkError") || error.message.includes("Failed to send")) {
        throw new Error("Network error: Unable to connect to transcription service. Please check your internet connection and try again.");
      }
      if (error.message.includes("ServerProxyError")) {
        throw new Error("Server error: The transcription service is currently unavailable. Please try again in a few moments.");
      }
      if (error.message.includes("ValidationError")) {
        throw new Error(`Input validation error: ${error.message}`);
      }
      if (error.message.includes("AuthError")) {
        throw new Error("Authentication error: Please log in again to continue using transcription.");
      }
      if (error.message.includes("SerializationError")) {
        throw new Error("Data processing error: Unable to process the transcription response. Please try again.");
      }
    }
    
    throw new Error(getErrorMessage(error, 'transcription'));
  }
}

export async function transcribeAudioBlobViaBatch(
  audioBlob: Blob,
  sessionId: string,
  language?: string,
  prompt?: string,
  temperature?: number
): Promise<{ text: string }> {
  try {
    if (!audioBlob) {
      const errorMsg = "No audio data was provided";
      await logError(new Error(errorMsg), "Voice Transcription - Missing Audio Blob");
      throw new Error(errorMsg);
    }

    if (!sessionId) {
      throw new Error("Session ID is required for transcription");
    }

    const result = await transcribeAudioChunk(audioBlob, 0, sessionId, language, prompt, temperature);
    
    return { text: result.text };
  } catch (error) {
    await logError(error, "transcribeAudioBlobViaBatch", { 
      sessionId, 
      audioSize: audioBlob?.size,
      hasPrompt: !!prompt,
      temperature
    });
    
    // Enhanced error handling for batch transcription
    if (error instanceof Error) {
      if (error.message.includes("No audio data")) {
        throw new Error("No audio data provided: Please record some audio before transcribing.");
      }
      if (error.message.includes("Session ID is required")) {
        throw new Error("Session required: Please start a new session to use transcription.");
      }
      if (error.message.includes("Temperature must be")) {
        throw new Error("Invalid temperature setting: Please choose a value between 0 and 1.");
      }
      if (error.message.includes("Prompt must be")) {
        throw new Error("Transcription prompt too long: Please use 1000 characters or fewer.");
      }
    }
    
    throw new Error(getErrorMessage(error, 'transcription'));
  }
}

export async function transcribeAudioBlobAction(
  audioBlob: Blob,
  sessionId: string,
  language?: string,
  prompt?: string,
  temperature?: number
): Promise<ActionState<{ text: string }>> {
  try {
    const result = await transcribeAudioBlobViaBatch(audioBlob, sessionId, language, prompt, temperature);
    
    return {
      isSuccess: true,
      message: "Transcription completed successfully",
      data: { text: result.text },
    };
  } catch (error) {
    await logError(error, "transcribeAudioBlobAction", { 
      sessionId, 
      audioSize: audioBlob?.size 
    });
    
    return {
      isSuccess: false,
      message: getErrorMessage(error, 'transcription'),
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'transcription'))
    };
  }
}

// Transcription Settings Type (re-exported from settings.ts)
export interface TranscriptionSettings {
  defaultLanguage?: string | null;
  defaultPrompt?: string | null;
  defaultTemperature?: number | null;
  model?: string | null;
}


import { invoke } from "@tauri-apps/api/core";
import { AppError, ErrorType, getErrorMessage, logError } from "@/utils/error-handling";

export async function transcribeAudioChunk(
  audioChunk: Blob,
  durationMs: number,
  mimeType: string,
  language?: string,
  prompt?: string,
  temperature?: number,
  model?: string
): Promise<{ text: string }> {
  try {
    if (!audioChunk) {
      const errorMsg = "No audio chunk was provided";
      await logError(new AppError(errorMsg, ErrorType.VALIDATION_ERROR), "Voice Transcription - Missing Audio Chunk");
      throw new AppError(errorMsg, ErrorType.VALIDATION_ERROR);
    }

    // Add validation for audio chunk size
    if (audioChunk.size < 1024) {
      const errorMsg = `Audio chunk too small: ${audioChunk.size} bytes (minimum 1024 bytes required)`;
      await logError(new AppError(errorMsg, ErrorType.VALIDATION_ERROR), "Voice Transcription - Audio Chunk Too Small");
      throw new AppError(errorMsg, ErrorType.VALIDATION_ERROR);
    }

    if (temperature !== undefined && (temperature < 0 || temperature > 1)) {
      throw new AppError("Temperature must be between 0 and 1", ErrorType.VALIDATION_ERROR);
    }

    if (prompt !== undefined && prompt.trim().length > 1000) {
      throw new AppError("Prompt must be 1000 characters or less", ErrorType.VALIDATION_ERROR);
    }

    // Convert Blob to Uint8Array for Tauri
    const arrayBuffer = await audioChunk.arrayBuffer();
    const audioData = Array.from(new Uint8Array(arrayBuffer));

    // Extract file extension from MIME type
    const fileExtension = (mimeType.split('/')[1] || 'webm').split(';')[0];
    const filename = `audio.${fileExtension}`;

    // Call the Tauri command instead of making a direct fetch
    const result = await invoke<{ text: string }>('transcribe_audio_command', {
      audioData,
      durationMs,
      mimeType,
      filename,
      language: language || null,
      prompt: prompt || null,
      temperature: temperature !== undefined ? temperature : null,
      model: model || null,
    });

    return {
      text: result.text || ""
    };
  } catch (error) {
    await logError(error, "transcribeAudioChunk", { hasPrompt: !!prompt, temperature });

    // If it's already an AppError, re-throw it
    if (error instanceof AppError) {
      throw error;
    }

    // Handle other errors by converting to AppError
    const errorMessage = getErrorMessage(error, 'transcription');
    throw new AppError(errorMessage, ErrorType.API_ERROR, { cause: error instanceof Error ? error : undefined });
  }
}



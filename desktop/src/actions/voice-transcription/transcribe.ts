import { invoke } from "@tauri-apps/api/core";
import { AppError, ErrorType, mapStatusToErrorType, getErrorMessage, logError } from "@/utils/error-handling";

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

    const serverUrl = await invoke<string>('get_server_url');
    const jwt = await invoke<string>('get_app_jwt');

    const formData = new FormData();
    
    const fileExtension = (mimeType.split('/')[1] || 'webm').split(';')[0];
    const filename = `audio.${fileExtension}`;
    formData.append('file', audioChunk, filename);
    
    if (model) formData.append('model', model);
    if (language) formData.append('language', language);
    if (prompt) formData.append('prompt', prompt);
    if (temperature !== undefined) formData.append('temperature', temperature.toString());
    formData.append('duration_ms', durationMs.toString());

    const response = await fetch(`${serverUrl}/api/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`
      },
      body: formData
    });

    if (!response.ok) {
      let errorType = mapStatusToErrorType(response.status);
      let errorMessage = `HTTP error! status: ${response.status}`;
      
      try {
        // Parse JSON from response body to get server-provided error message and type
        const errorData = await response.json();
        const serverMessage = errorData.error?.message || errorData.message;
        if (serverMessage) {
          errorMessage = serverMessage;
        }
        
        // Check for server-provided error_type to get more accurate error classification
        const serverErrorType = errorData.error_type || errorData.error?.type;
        if (serverErrorType) {
          // Map server error types to client ErrorType
          if (serverErrorType === 'credit_insufficient' || serverErrorType === 'insufficient_credits') {
            errorType = ErrorType.CREDIT_INSUFFICIENT;
          } else if (serverErrorType === 'payment_failed') {
            errorType = ErrorType.PAYMENT_FAILED;
          } else if (serverErrorType === 'payment_required') {
            errorType = ErrorType.PAYMENT_REQUIRED;
          }
          // Add more mappings as needed
        }
      } catch (parseError) {
        // If parsing fails, fallback to HTTP status message
        console.warn('Failed to parse error response:', parseError);
      }
      
      throw new AppError(errorMessage, errorType, { statusCode: response.status });
    }

    const result = await response.json();
    
    return {
      text: result.text || ""
    };
  } catch (error) {
    await logError(error, "transcribeAudioChunk", { hasPrompt: !!prompt, temperature });
    
    // If it's already an AppError, re-throw it
    if (error instanceof AppError) {
      throw error;
    }
    
    // Handle network errors
    if (error instanceof Error && (error.message.includes("NetworkError") || error.message.includes("fetch") || error.name === "TypeError")) {
      throw new AppError("Network error: Unable to connect to transcription service. Please check your internet connection and try again.", ErrorType.NETWORK_ERROR, { cause: error });
    }
    
    // Handle other errors by converting to AppError
    const errorMessage = getErrorMessage(error, 'transcription');
    throw new AppError(errorMessage, ErrorType.API_ERROR, { cause: error instanceof Error ? error : undefined });
  }
}



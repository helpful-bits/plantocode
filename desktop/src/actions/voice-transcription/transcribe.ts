import { invoke } from "@tauri-apps/api/core";

import { type ActionState } from "@/types";
import { WHISPER_MAX_FILE_SIZE_MB } from "@/utils/constants";
import { extractErrorInfo, createUserFriendlyErrorMessage, getErrorMessage, logError } from "@/utils/error-handling";

export async function transcribeAudioStream(
  audioStream: ReadableStream<Uint8Array>,
  filename: string,
  durationMs: number,
  model: string
): Promise<{ text: string }> {
  try {
    if (!audioStream) {
      const errorMsg = "No audio stream was provided";
      await logError(new Error(errorMsg), "Voice Transcription - Missing Audio Stream");
      throw new Error(errorMsg);
    }

    const [serverUrl, jwt] = await Promise.all([
      invoke<string>("get_server_url"),
      invoke<string>("get_app_jwt"),
    ]);

    if (!jwt) {
      throw new Error("Authentication required. Please log in.");
    }

    const response = await fetch(`${serverUrl}/api/proxy/audio/transcriptions/stream`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "audio/webm",
        "X-Filename": filename,
        "X-Duration-MS": String(durationMs),
        "X-Model-Id": model,
      },
      body: audioStream,
      duplex: "half",
    } as RequestInit);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `Server responded with status ${response.status}`);
    }

    const result = await response.json();
    return { text: result.text };
  } catch (error) {
    await logError(error, "transcribeAudioStream", { filename, durationMs, model });
    throw new Error(getErrorMessage(error, 'transcription'));
  }
}

export async function transcribeAudioBlob(
  audioBlob: Blob,
  durationMs?: number,
  language?: string
): Promise<{ text: string }> {
  try {
    if (!audioBlob) {
      const errorMsg = "No audio data was provided";
      await logError(new Error(errorMsg), "Voice Transcription - Missing Audio Blob");
      throw new Error(errorMsg);
    }

    const fileSizeMB = audioBlob.size / (1024 * 1024);
    if (fileSizeMB > WHISPER_MAX_FILE_SIZE_MB) {
      throw new Error(
        `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${WHISPER_MAX_FILE_SIZE_MB}MB.`
      );
    }

    const [serverUrl, jwt] = await Promise.all([
      invoke<string>("get_server_url"),
      invoke<string>("get_app_jwt"),
    ]);

    if (!jwt) {
      throw new Error("Authentication required. Please log in.");
    }

    const formData = new FormData();
    formData.append("file", audioBlob, `recording_${Date.now()}.webm`);
    formData.append("model", "groq/whisper-large-v3-turbo");
    formData.append("duration_ms", String(durationMs && durationMs > 0 ? durationMs : Math.max(Math.round(audioBlob.size / 10), 1000)));
    
    if (language) {
      formData.append("language", language);
    }

    const response = await fetch(`${serverUrl}/api/proxy/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(errorData.message || `Server responded with status ${response.status}`);
    }

    const result = await response.json();
    return { text: result.text };
  } catch (error) {
    await logError(error, "transcribeAudioBlob", { audioSize: audioBlob?.size });
    throw new Error(getErrorMessage(error, 'transcription'));
  }
}

export async function createTranscriptionJobFromBlobAction(
  audioBlob: Blob,
  sessionId: string,
  projectDirectory?: string,
  durationMs?: number,
  language?: string
): Promise<ActionState<{ jobId: string }>> {
  try {
    if (!audioBlob) {
      const errorMsg = "No audio data was provided";
      await logError(new Error(errorMsg), "Voice Transcription Job - Missing Audio Blob");
      return {
        isSuccess: false,
        message: errorMsg,
      };
    }

    const fileSizeMB = audioBlob.size / (1024 * 1024);
    if (fileSizeMB > WHISPER_MAX_FILE_SIZE_MB) {
      return {
        isSuccess: false,
        message: `Audio file is too large (${fileSizeMB.toFixed(2)}MB). Maximum allowed size is ${WHISPER_MAX_FILE_SIZE_MB}MB.`,
      };
    }

    if (!sessionId) {
      return {
        isSuccess: false,
        message: "A valid session ID is required for voice transcription",
      };
    }

    const arrayBuffer = await audioBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const filename = `recording_${Date.now()}.wav`;

    const result = await invoke<{ jobId: string }>(
      "create_transcription_job_command",
      {
        sessionId: sessionId,
        audioData: uint8Array,
        filename,
        projectDirectory: projectDirectory ?? null,
        durationMs: durationMs && durationMs > 0 ? durationMs : Math.max(Math.round(uint8Array.length / 10), 1000),
        language: language ?? null,
      }
    );

    return {
      isSuccess: true,
      message: "Transcription job started",
      data: { jobId: result.jobId },
      metadata: {
        jobId: result.jobId,
        isBackgroundJob: true,
      },
    };
  } catch (error) {
    await logError(error, "createTranscriptionJobFromBlobAction", { 
      sessionId, 
      audioSize: audioBlob?.size,
      projectDirectory 
    });
    
    const errorInfo = extractErrorInfo(error);
    const userMessage = createUserFriendlyErrorMessage(errorInfo, "voice transcription");
    
    return {
      isSuccess: false,
      message: userMessage,
      error: error instanceof Error ? error : new Error(getErrorMessage(error, 'transcription'))
    } as ActionState<{ jobId: string }>;
  }
}

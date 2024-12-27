"use server";

import { ActionState } from "@/types";

export async function transcribeVoiceAction(request: {
  blob: Blob;
  mimeType: string;
  languageCode?: string;
}): Promise<ActionState<string>> {
  try {
    const form = new FormData();

    const blob = new Blob([request.blob], { type: request.mimeType });

    const extensionMap: Record<string, string> = {
      "audio/flac": "flac",
      "audio/mp3": "mp3", 
      "audio/mp4": "mp4",
      "audio/mpeg": "mpeg",
      "audio/mpga": "mpga",
      "audio/m4a": "m4a",
      "audio/ogg": "ogg",
      "audio/opus": "opus",
      "audio/wav": "wav",
      "audio/webm": "webm"
    };
    const extension = extensionMap[request.mimeType] || "webm";
    form.append("file", blob, `audiofile.${extension}`);

    form.append("model", "whisper-large-v3-turbo");
    form.append("temperature", "0.0");
    form.append("response_format", "json");
    form.append("language", request.languageCode ?? "en");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      body: form,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error: ${errText}`);
    }

    const data = await response.json();
    if (!data?.text) {
      throw new Error("No transcription text in response");
    }

    return {
      isSuccess: true,
      message: "Voice transcribed successfully",
      data: data.text,
    };

  } catch (error) {
    console.error("Error transcribing voice:", error);
    return {
      isSuccess: false,
      message: "Failed to transcribe voice",
    };
  }
} 
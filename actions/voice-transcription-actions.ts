"use server";
 
import { ActionState } from "@/types";

export async function transcribeVoiceAction(request: {
  blob: Blob;
  mimeType: string;
  languageCode?: string; // Optional language code
}): Promise<ActionState<string>> {
  try {
    if (!request.blob || request.blob.size === 0) {
      console.error("Empty audio blob received");
      return {
        isSuccess: false, // Keep false
        message: "Empty audio recording received. Please try again with a valid recording.",
      };
    }
    
    const form = new FormData();

    const normalizedMimeType = request.mimeType.split(';')[0].toLowerCase(); // Get base MIME type first
    
    const extensionMap: Record<string, string> = { // Define extension map
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

    console.log(`Sending ${filename} (${request.languageCode || 'en'}) to Groq Whisper API...`);
    
    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY is not defined");
      return {
        isSuccess: false,
        message: "Transcription service configuration error. Please contact support.",
      };
    }

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      body: form,
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Groq API error (${response.status}): ${errText}`);
      
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
      return {
        isSuccess: false,
        message: "No transcription text in response. Please try again with a clearer recording.",
      };
    }

    console.log(`Transcription successful: Received ${data.text?.length || 0} characters.`);
    return <ActionState<string>>{
      isSuccess: true,
      message: "Voice transcribed successfully",
      data: data.text,
    };
  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error("Error transcribing voice:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    return {
      isSuccess: false,
      message: `Failed to transcribe voice: ${errorMessage}`,
    };
  }
}

"use server";

// Re-export both transcription action types
export { transcribeVoiceAction } from './transcribe-blob';
export { transcribeAudioAction } from './transcribe-base64'; 
/**
 * Voice Recording Hooks Index
 *
 * This file provides a central export point for all voice recording related hooks.
 */

export { useVoiceRecording } from "./use-voice-recording";
export { useVoiceMediaState } from "./use-voice-media-state";
export { useVoiceTranscriptionProcessing } from "./use-voice-transcription-processing";
export { useAudioInputDevices } from "./use-audio-input-devices";

// Note: These handlers are not hooks themselves, but they're used by the hooks
// and exported here for convenience
export * as VoiceMediaHandler from "./voice-media-handler";

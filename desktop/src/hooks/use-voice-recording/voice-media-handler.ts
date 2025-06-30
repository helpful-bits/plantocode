/**
 * MediaRecorder handling utility functions for voice recording
 */

interface MediaSetupOptions {
  onDataAvailable: (chunk: Blob) => void;
  onError: (error: string) => void;
  onStop: () => void;
  deviceId?: string;
}

export interface MediaSetupResult {
  stream: MediaStream;
  recorder: MediaRecorder;
  activeDeviceId: string | null;
  activeDeviceLabel: string | null;
  mimeType: string;
}

/**
 * Sets up the media stream and recorder for voice input
 */
export async function setupMedia({
  onDataAvailable,
  onError,
  onStop,
  deviceId,
}: MediaSetupOptions): Promise<MediaSetupResult | null> {
  try {
    // Configure audio constraints
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      // Try to use higher sample rate if available
      sampleRate: { ideal: 48000 },
      // Request higher bitrate if available
      channelCount: 1, // Mono is better for speech recognition
    };

    // Add deviceId constraint only if a specific, non-"default" deviceId is provided
    if (deviceId && deviceId.trim() && deviceId !== "default") {
      audioConstraints.deviceId = { exact: deviceId };
    }
    // If deviceId is "default", empty, or undefined, no deviceId constraint is added,
    // allowing the browser to select the system default audio input device.

    // Request audio with the configured constraints
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });

    // Check if MediaRecorder is supported
    if (!window.MediaRecorder) {
      onError("MediaRecorder not supported in this browser");
      return null;
    }

    // Define MIME type options in order of preference for transcription-friendly formats
    // Remove codec parameters as they can break decoding in GPT-4o models
    const mimeTypePreference = [
      "audio/webm",
      "audio/mp4",
      "audio/mpeg", 
      "audio/ogg",
      "audio/wav",
      "audio/flac",
      "", // Empty string as last resort (browser default)
    ];

    // Find the first supported MIME type
    let mimeType = mimeTypePreference.find((type) => {
      return type === "" || MediaRecorder.isTypeSupported(type);
    });

    // Clean up MIME type by removing codec parameters if present
    if (mimeType && mimeType.includes(';')) {
      mimeType = mimeType.split(';')[0].trim();
    }

    // Handle case where no supported MIME type is found
    if (mimeType === undefined) {
      onError("No supported audio MIME type found for recording.");
      return null;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[MediaHandler] Using MIME type: ${mimeType || "browser default"}`
    );

    // Configure the MediaRecorder with optimized settings
    const recorderOptions: MediaRecorderOptions = {
      mimeType: mimeType || undefined,
    };

    // Check if we can set audio bitrate on some browsers
    if ("audioBitsPerSecond" in MediaRecorder.prototype) {
      // We need to add the audioBitsPerSecond property to the options object
      // as it might not be in the standard MediaRecorderOptions type
      (recorderOptions as Record<string, unknown>).audioBitsPerSecond = 128000; // 128 kbps is good for speech
    }

    const recorder = new MediaRecorder(stream, recorderOptions);

    // Clean up recorder MIME type by removing codec parameters if present
    let finalMimeType = mimeType || "";
    if (recorder.mimeType && recorder.mimeType.includes(';')) {
      finalMimeType = recorder.mimeType.split(';')[0].trim();
    } else if (recorder.mimeType) {
      finalMimeType = recorder.mimeType;
    }

    // Get active audio track details
    let activeDeviceId: string | null = null;
    let activeDeviceLabel: string | null = null;

    // Get information about the active audio track
    if (stream.getAudioTracks().length > 0) {
      const activeTrack = stream.getAudioTracks()[0];

      // Get device ID from track settings
      const trackSettings = activeTrack.getSettings();
      activeDeviceId = trackSettings.deviceId || null;

      // Get the label from the track
      activeDeviceLabel = activeTrack.label || null;

      // eslint-disable-next-line no-console
      console.log(
        `[MediaHandler] Active audio device: ${activeDeviceLabel || "Unknown"} (${activeDeviceId || "No ID"})`
      );
    }

    // Enhanced event handler with concise logging
    recorder.onstart = () => {
      // eslint-disable-next-line no-console
      console.log(`[MediaHandler] Recording started - State: ${recorder.state}, MIME: ${finalMimeType}, Tracks: ${stream.getAudioTracks().length}`);
    };

    // Handle data chunks with concise logging
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        // eslint-disable-next-line no-console
        console.log(`[MediaHandler] Audio chunk: ${event.data.size} bytes, Type: ${event.data.type}`);
        
        // Log warning for unusually small chunks
        if (event.data.size < 100) {
          console.warn(`[MediaHandler] Small chunk: ${event.data.size} bytes`);
        }
        
        onDataAvailable(event.data);
      } else {
        console.warn(`[MediaHandler] Empty chunk received`);
      }
    };

    // Simplified error handling
    recorder.onerror = (event) => {
      const errorMessage = event.error?.message || event.error?.name || "Unknown error";

      console.error(`[MediaHandler] Recording error: ${errorMessage}`);
      onError(`Recording error: ${errorMessage}. Please try again.`);
    };

    // Stop handler with concise logging
    recorder.onstop = () => {
      // eslint-disable-next-line no-console
      console.log(`[MediaHandler] Recording stopped - State: ${recorder.state}, Stream active: ${stream.active}`);
      onStop();
    };

    return { stream, recorder, activeDeviceId, activeDeviceLabel, mimeType: finalMimeType || "audio/webm" };
  } catch (error) {
    console.error("Media setup error:", error);

    // Format user-friendly error message based on error type
    let errorMessage = "Could not access microphone.";

    if (error instanceof Error) {
      // Check for permission error
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        errorMessage =
          "Microphone permission denied. Please allow microphone access and try again.";
      }
      // Check for device not found error
      else if (
        error.name === "NotFoundError" ||
        error.name === "DevicesNotFoundError"
      ) {
        errorMessage =
          "No microphone detected. Please connect a microphone and try again.";
      }
      // Check for secure context requirement
      else if (error.name === "SecurityError") {
        errorMessage = "Recording requires a secure connection (HTTPS).";
      }
      // Add specific error detail for debugging
      errorMessage += ` (${error.name}: ${error.message})`;
    }

    onError(errorMessage);
    return null;
  }
}

/**
 * Cleans up media resources
 */
export function cleanupMedia(
  recorder: MediaRecorder | null,
  stream: MediaStream | null
): void {
  // Stop the recorder if it's active
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch (e) {
      console.error("Error stopping recorder:", e);
    }
  }

  // Stop all tracks in the stream
  if (stream) {
    try {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    } catch (e) {
      console.error("Error stopping media stream tracks:", e);
    }
  }
}

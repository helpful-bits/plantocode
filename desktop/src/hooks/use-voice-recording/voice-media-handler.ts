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
      sampleRate: 44100,
      // Request higher bitrate if available
      channelCount: 1, // Mono is better for speech recognition
    };

    // Add deviceId constraint if provided and not 'default' or empty
    if (deviceId && deviceId.trim() && deviceId !== "default") {
      audioConstraints.deviceId = { exact: deviceId };
    } else if (deviceId === "default") {
      // For 'default', we can either explicitly request it or let the browser handle default behavior
      audioConstraints.deviceId = { exact: "default" };
    }

    // Request audio with the configured constraints
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });

    // Check if MediaRecorder is supported
    if (!window.MediaRecorder) {
      onError("MediaRecorder not supported in this browser");
      return null;
    }

    // Define MIME type options in order of preference for Whisper compatibility
    // Whisper works best with webm, mp3, wav, and flac formats
    const mimeTypePreference = [
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg; codecs=opus",
      "audio/wav",
      "audio/flac",
      "", // Empty string as last resort (browser default)
    ];

    // Find the first supported MIME type
    const mimeType = mimeTypePreference.find((type) => {
      return type === "" || MediaRecorder.isTypeSupported(type);
    });

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

    // Add an event handler for when recording starts
    recorder.onstart = () => {
      // eslint-disable-next-line no-console
      console.log("[MediaHandler] Recording started successfully");

      // Force a data available event after a short delay to ensure we're capturing
      setTimeout(() => {
        if (recorder.state === "recording") {
          // eslint-disable-next-line no-console
          console.log(
            "[MediaHandler] Requesting data from recorder via requestData()"
          );
          recorder.requestData();
        }
      }, 1000);
    };

    // Handle data chunks as they become available
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        // eslint-disable-next-line no-console
        console.log(
          `[MediaHandler] Received audio chunk size: ${event.data.size} bytes, type: ${event.data.type}`
        );
        onDataAvailable(event.data);
      } else {
        console.warn("[MediaHandler] Received empty audio chunk");
      }
    };

    // Log more detailed error information
    recorder.onerror = (event) => {
      // Get detailed error info when available
      const errorDetails = event.error
        ? `${(event.error && typeof event.error === 'object' && 'name' in event.error && typeof event.error.name === 'string') ? event.error.name : 'Error'}: ${(event.error && typeof event.error === 'object' && 'message' in event.error && typeof event.error.message === 'string') ? event.error.message : 'Unknown error'}`
        : "Unknown MediaRecorder error";

      console.error(
        `[MediaHandler] MediaRecorder error: ${errorDetails}`,
        event
      );
      onError(`Error during recording: ${errorDetails}. Please try again.`);
    };

    // Handle recorder stop event
    recorder.onstop = () => {
      // eslint-disable-next-line no-console
      console.log("[MediaHandler] Recording stopped");
      onStop();
    };

    return { stream, recorder, activeDeviceId, activeDeviceLabel };
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

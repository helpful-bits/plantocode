"use client";

import { useState, useRef, useCallback } from "react";

import { setupMedia, cleanupMedia } from "./voice-media-handler";

interface UseVoiceMediaStateProps {
  onError: (error: string) => void;
  selectedAudioInputId: string;
}

export function useVoiceMediaState({
  onError,
  selectedAudioInputId,
}: UseVoiceMediaStateProps) {
  // Refs for MediaRecorder objects
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Save the last blob for retry capability
  const lastAudioBlobRef = useRef<Blob | null>(null);

  // Device info state
  const [activeAudioInputLabel, setActiveAudioInputLabel] = useState<
    string | null
  >(null);

  // Start media recording
  const startMediaRecording = useCallback(async () => {
    // Reset previous recording data
    audioChunksRef.current = [];

    // Set up media and recorder with selected device
    const media = await setupMedia({
      onDataAvailable: (chunk) => {
        // eslint-disable-next-line no-console
        console.log(
          `[VoiceRecording] Data available event received, chunk size: ${chunk.size} bytes`
        );
        audioChunksRef.current.push(chunk);
      },
      onError,
      onStop: () => {
        // This is handled by stopMediaRecording
      },
      deviceId: selectedAudioInputId,
    });

    if (!media) {
      // Error is already reported via onError callback
      return null;
    }

    // Store references
    streamRef.current = media.stream;
    recorderRef.current = media.recorder;

    // Update active device information
    if (media.activeDeviceLabel) {
      // eslint-disable-next-line no-console
      console.log(
        `[VoiceRecording] Active device label: ${media.activeDeviceLabel}`
      );
      setActiveAudioInputLabel(media.activeDeviceLabel);
    }

    // Start recording with a timeslice to ensure ondataavailable events fire periodically
    // 10000ms (10 seconds) is a good balance - not too frequent but ensures we get chunks during recording
    recorderRef.current.start(10000); // Request data every 10 seconds

    // Also set up a manual requestData call every 3 seconds as a backup
    const interval = setInterval(() => {
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try {
          // eslint-disable-next-line no-console
          console.log(
            "[VoiceRecording] Manually requesting data from recorder"
          );
          recorderRef.current.requestData();
        } catch (err) {
          console.warn("[VoiceRecording] Error requesting data:", err);
        }
      } else {
        clearInterval(interval);
      }
    }, 3000);

    // Store the interval so we can clear it on stop
    const intervalId = interval as unknown as number;

    // Clear the interval when recording stops
    const originalStop = recorderRef.current.onstop;
    recorderRef.current.onstop = (ev) => {
      clearInterval(intervalId);
      if (originalStop && recorderRef.current)
        originalStop.call(recorderRef.current, ev);
    };

    // eslint-disable-next-line no-console
    console.log("[VoiceRecording] Recording started");
    return media;
  }, [selectedAudioInputId, onError]);

  // Stop media recording
  const stopMediaRecording = useCallback(async (): Promise<Blob | null> => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      // eslint-disable-next-line no-console
      console.log("[VoiceRecording] Recorder already inactive");
      return null;
    }

    try {
      // Make one final request for data before stopping
      if (recorderRef.current && recorderRef.current.state === "recording") {
        // eslint-disable-next-line no-console
        console.log(
          "[VoiceRecording] Making final requestData() call before stopping"
        );
        try {
          recorderRef.current.requestData();

          // Wait a short moment to make sure the data is collected
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (err) {
          console.warn("[VoiceRecording] Error in final requestData:", err);
        }
      }

      // Stop the recorder - this will finalize the data
      // eslint-disable-next-line no-console
      console.log("[VoiceRecording] Stopping recorder...");
      recorderRef.current.stop();

      // Create a blob from all the audio chunks
      // eslint-disable-next-line no-console
      console.log(
        `[VoiceRecording] Audio chunks captured: ${audioChunksRef.current.length}`
      );

      if (audioChunksRef.current.length > 0) {
        // Log individual chunk sizes for debugging
        audioChunksRef.current.forEach((chunk, index) => {
          // eslint-disable-next-line no-console
          console.log(
            `[VoiceRecording] Chunk ${index} size: ${chunk.size} bytes`
          );
        });

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        // eslint-disable-next-line no-console
        console.log(
          `[VoiceRecording] Created audio blob with size: ${audioBlob.size} bytes`
        );

        // Save the blob for potential retry
        lastAudioBlobRef.current = audioBlob;

        // Check if blob size is too small, which might indicate no actual audio was recorded
        if (audioBlob.size < 1000) {
          // eslint-disable-next-line no-console
          console.error(
            `[VoiceRecording] Audio blob size too small: ${audioBlob.size} bytes - minimum required: 1000 bytes`
          );
          onError("No audio recorded or audio too short");
          return null;
        }

        return audioBlob;
      } else {
        // eslint-disable-next-line no-console
        console.error(
          "[VoiceRecording] No audio chunks captured during recording"
        );

        // Try to get audio data directly from the stream as a fallback
        if (streamRef.current) {
          try {
            // eslint-disable-next-line no-console
            console.log(
              "[VoiceRecording] Attempting fallback recording method using stream tracks"
            );

            // Create a new MediaRecorder for the current stream
            const fallbackRecorder = new MediaRecorder(streamRef.current);
            const fallbackChunks: Blob[] = [];

            // Set up fallback recorder
            fallbackRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                // eslint-disable-next-line no-console
                console.log(
                  `[VoiceRecording] Fallback received chunk: ${event.data.size} bytes`
                );
                fallbackChunks.push(event.data);
              }
            };

            // Create a promise to wait for the fallback recording
            await new Promise<void>((resolve, reject) => {
              fallbackRecorder.onstop = () => {
                if (fallbackChunks.length > 0) {
                  resolve();
                } else {
                  reject(new Error("No audio captured by fallback recorder"));
                }
              };

              fallbackRecorder.onerror = (error) => {
                // Error could be of various types, safely convert to string
                const errorMessage = error instanceof Error 
                  ? error.message 
                  : (typeof error === 'object' && error !== null)
                    ? 'MediaRecorder error: ' + JSON.stringify(error)
                    : (typeof error === 'number' || typeof error === 'boolean' || error === null)
                      ? String(error)
                      : 'Unknown error';
                reject(new Error(errorMessage));
              };

              // Start recording for a short time
              fallbackRecorder.start();

              // Stop after 1 second - we just need some audio data
              setTimeout(() => {
                if (fallbackRecorder.state === "recording") {
                  fallbackRecorder.stop();
                }
              }, 1000);
            });

            // If we got here, we have some audio chunks in the fallback recorder
            if (fallbackChunks.length > 0) {
              // eslint-disable-next-line no-console
              console.log(
                `[VoiceRecording] Fallback captured ${fallbackChunks.length} chunks`
              );

              const fallbackBlob = new Blob(fallbackChunks, {
                type: "audio/webm",
              });
              if (fallbackBlob.size > 1000) {
                // eslint-disable-next-line no-console
                console.log(
                  `[VoiceRecording] Using fallback blob of size ${fallbackBlob.size} bytes`
                );

                // Save the blob for potential retry
                lastAudioBlobRef.current = fallbackBlob;
                return fallbackBlob;
              }
            }
          } catch (fallbackError) {
            console.error(
              "[VoiceRecording] Fallback recording method failed:",
              fallbackError
            );
          }
        }

        // If we get here, even the fallback didn't work
        onError(
          "No audio recorded. Please check your microphone and try again."
        );
        return null;
      }
    } catch (err) {
      console.error("[VoiceRecording] Error in stopMediaRecording:", err);
      onError(
        err instanceof Error ? err.message : "Error processing recording"
      );
      return null;
    } finally {
      // Clean up media resources
      cleanupMedia(recorderRef.current, streamRef.current);
      recorderRef.current = null;
      streamRef.current = null;
    }
  }, [onError]);

  // Reset media state
  const resetMediaState = useCallback(() => {
    // Clean up any existing media
    cleanupMedia(recorderRef.current, streamRef.current);
    recorderRef.current = null;
    streamRef.current = null;

    // Clear all related state
    setActiveAudioInputLabel(null);
    audioChunksRef.current = [];
  }, []);

  return {
    recorderRef,
    streamRef,
    audioChunksRef,
    lastAudioBlobRef,
    activeAudioInputLabel,
    startMediaRecording,
    stopMediaRecording,
    resetMediaState,
  };
}

"use client";

import { useState, useEffect, useCallback } from "react";

export function useAudioInputDevices() {
  const [availableAudioInputs, setAvailableAudioInputs] = useState<
    MediaDeviceInfo[]
  >([]);
  const [selectedAudioInputId, setSelectedAudioInputId] =
    useState<string>("default");

  // Enumerate available audio input devices
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput"
        );
        // eslint-disable-next-line no-console
        console.log(
          `[AudioDevices] Found ${audioInputs.length} audio input devices`
        );
        setAvailableAudioInputs(audioInputs);
      } catch (error) {
        console.error("[AudioDevices] Error enumerating media devices:", error);
      }
    };

    void enumerateDevices();
  }, []);

  // Function to select audio input device
  const selectAudioInput = useCallback((deviceId: string) => {
    // eslint-disable-next-line no-console
    console.log(`[AudioDevices] Selecting audio input device: ${deviceId}`);
    setSelectedAudioInputId(deviceId);
  }, []);

  // Re-enumerate devices to ensure labels are populated after permissions
  const refreshDeviceList = useCallback(async () => {
    try {
      // Add a small delay to ensure browser has updated device information
      await new Promise((resolve) => setTimeout(resolve, 100));

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(
        (device) => device.kind === "audioinput"
      );

      // Log detailed device information for debugging
      audioInputs.forEach((device, idx) => {
        // eslint-disable-next-line no-console
        console.log(
          `[AudioDevices] Device ${idx}: ID=${device.deviceId}, Label=${device.label}`
        );
      });

      setAvailableAudioInputs(audioInputs);
      return audioInputs;
    } catch (error) {
      console.error(
        "[AudioDevices] Error re-enumerating devices after permission:",
        error
      );
      return [];
    }
  }, []);

  return {
    availableAudioInputs,
    selectedAudioInputId,
    selectAudioInput,
    refreshDeviceList,
  };
}

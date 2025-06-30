"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = 'vibe-manager-audio-device';

export function useAudioInputDevices() {
  const [availableAudioInputs, setAvailableAudioInputs] = useState<
    MediaDeviceInfo[]
  >([]);
  
  // Initialize selected device from localStorage or default
  const [selectedAudioInputId, setSelectedAudioInputId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem(STORAGE_KEY) || "default";
      } catch (error) {
        console.warn('[AudioDevices] Failed to read from localStorage:', error);
        return "default";
      }
    }
    return "default";
  });

  // Enumerate available audio input devices
  useEffect(() => {
    const enumerateDevices = async () => {
      if (navigator.mediaDevices) {
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
      } else {
        console.error("[AudioDevices] MediaDevices API is not available.");
        setAvailableAudioInputs([]);
      }
    };

    void enumerateDevices();
  }, []);

  // Function to select audio input device
  const selectAudioInput = useCallback((deviceId: string) => {
    // eslint-disable-next-line no-console
    console.log(`[AudioDevices] Selecting audio input device: ${deviceId}`);
    setSelectedAudioInputId(deviceId);
    
    // Save to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, deviceId);
      } catch (error) {
        console.warn('[AudioDevices] Failed to save to localStorage:', error);
      }
    }
  }, []);

  // Re-enumerate devices to ensure labels are populated after permissions
  const refreshDeviceList = useCallback(async () => {
    if (navigator.mediaDevices) {
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

        // Check if the selected device is still available
        const isSelectedDeviceAvailable = audioInputs.some(
          (device) => device.deviceId === selectedAudioInputId
        );

        if (!isSelectedDeviceAvailable && selectedAudioInputId !== "default") {
          // Device is no longer available, fall back to default
          setSelectedAudioInputId("default");
          // Update localStorage to reflect the fallback
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(STORAGE_KEY, "default");
            } catch (error) {
              console.warn('[AudioDevices] Failed to update localStorage:', error);
            }
          }
        }

        setAvailableAudioInputs(audioInputs);
        return audioInputs;
      } catch (error) {
        console.error(
          "[AudioDevices] Error re-enumerating devices after permission:",
          error
        );
        return [];
      }
    } else {
      console.error("[AudioDevices] MediaDevices API is not available.");
      setAvailableAudioInputs([]);
      return [];
    }
  }, [selectedAudioInputId]);

  useEffect(() => {
    if (navigator.mediaDevices) {
      const handleDeviceChange = () => {
        refreshDeviceList();
      };

      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      };
    }
    return undefined;
  }, [refreshDeviceList]);

  // Validate saved device when devices are first loaded
  useEffect(() => {
    if (availableAudioInputs.length > 0 && selectedAudioInputId !== "default") {
      const isSelectedDeviceAvailable = availableAudioInputs.some(
        (device) => device.deviceId === selectedAudioInputId
      );

      if (!isSelectedDeviceAvailable) {
        // Saved device is no longer available, fall back to default
        console.log(`[AudioDevices] Saved device ${selectedAudioInputId} no longer available, falling back to default`);
        setSelectedAudioInputId("default");
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, "default");
          } catch (error) {
            console.warn('[AudioDevices] Failed to update localStorage:', error);
          }
        }
      } else {
        console.log(`[AudioDevices] Restored saved device: ${selectedAudioInputId}`);
      }
    }
  }, [availableAudioInputs, selectedAudioInputId]);

  // Function to request microphone permission and populate device labels early
  const requestPermissionAndRefreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[AudioDevices] getUserMedia not supported");
      return false;
    }

    try {
      // Request basic microphone access to get permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      // Immediately stop the stream since we only needed permission
      stream.getTracks().forEach(track => track.stop());
      
      // eslint-disable-next-line no-console
      console.log("[AudioDevices] Microphone permission granted, refreshing device list");
      
      // Refresh the device list to get proper labels
      await refreshDeviceList();
      
      return true;
    } catch (error) {
      // Permission denied or other error
      console.warn("[AudioDevices] Microphone permission denied or unavailable:", error);
      return false;
    }
  }, [refreshDeviceList]);

  return {
    availableAudioInputs,
    selectedAudioInputId,
    selectAudioInput,
    refreshDeviceList,
    requestPermissionAndRefreshDevices,
  };
}

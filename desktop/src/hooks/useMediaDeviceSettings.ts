"use client";

import { useState, useEffect, useCallback } from "react";
import {
  VIDEO_ANALYSIS_MIN_FPS,
  VIDEO_ANALYSIS_MAX_FPS,
  VIDEO_ANALYSIS_FPS_STEP
} from "../types/video-analysis-types";

export const FPS_OPTIONS = [1, 5, 10, 15, 20, 24];

const STORAGE_KEY = 'plantocode-audio-device';

export function useMediaDeviceSettings() {
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

  const [selectedFrameRate, setSelectedFrameRate] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedFrameRate = localStorage.getItem('video-recording-frame-rate');
        if (savedFrameRate) {
          const parsedFrameRate = Number(savedFrameRate);
          if (!isNaN(parsedFrameRate)) {
            // Clamp to valid range
            const clampedFps = Math.min(
              VIDEO_ANALYSIS_MAX_FPS,
              Math.max(VIDEO_ANALYSIS_MIN_FPS, parsedFrameRate)
            );
            return clampedFps;
          }
        }
      } catch (error) {
        console.warn('[MediaDeviceSettings] Failed to read frame rate from localStorage:', error);
      }
    }
    return 5; // Default to 5 FPS
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
          
          // Deduplicate devices that have the same label
          const uniqueDevices = audioInputs.reduce((acc, device) => {
            // Skip "Default" prefixed duplicates if we already have the base device
            if (device.label && device.label.startsWith("Default - ")) {
              const baseLabel = device.label.replace("Default - ", "");
              const hasBaseDevice = audioInputs.some(d => d.label === baseLabel);
              if (hasBaseDevice) {
                return acc;
              }
            }
            
            // Skip "Communications" prefixed duplicates
            if (device.label && device.label.startsWith("Communications - ")) {
              return acc;
            }
            
            // Add device if not already present (by label)
            const isDuplicate = acc.some(d => d.label === device.label && d.label !== "");
            if (!isDuplicate) {
              acc.push(device);
            }
            
            return acc;
          }, [] as MediaDeviceInfo[]);
          
          setAvailableAudioInputs(uniqueDevices);
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

  // Save to localStorage whenever frame rate changes
  const updateSelectedFrameRate = (fps: number) => {
    // Clamp to valid range
    const clampedFps = Math.min(
      VIDEO_ANALYSIS_MAX_FPS,
      Math.max(VIDEO_ANALYSIS_MIN_FPS, fps)
    );
    setSelectedFrameRate(clampedFps);
    localStorage.setItem('video-recording-frame-rate', clampedFps.toString());
  };

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
        
        // Deduplicate devices that have the same label
        const uniqueDevices = audioInputs.reduce((acc, device) => {
          // Skip "Default" prefixed duplicates if we already have the base device
          if (device.label && device.label.startsWith("Default - ")) {
            const baseLabel = device.label.replace("Default - ", "");
            const hasBaseDevice = audioInputs.some(d => d.label === baseLabel);
            if (hasBaseDevice) {
              return acc;
            }
          }
          
          // Skip "Communications" prefixed duplicates
          if (device.label && device.label.startsWith("Communications - ")) {
            return acc;
          }
          
          // Add device if not already present (by label)
          const isDuplicate = acc.some(d => d.label === device.label && d.label !== "");
          if (!isDuplicate) {
            acc.push(device);
          }
          
          return acc;
        }, [] as MediaDeviceInfo[]);

        // Check if the selected device is still available
        const isSelectedDeviceAvailable = uniqueDevices.some(
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

        setAvailableAudioInputs(uniqueDevices);
        return uniqueDevices;
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
        setSelectedAudioInputId("default");
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, "default");
          } catch (error) {
            console.warn('[AudioDevices] Failed to update localStorage:', error);
          }
        }
      } else {
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
    selectedFrameRate,
    updateSelectedFrameRate,
    FPS_OPTIONS,
    videoMinFps: VIDEO_ANALYSIS_MIN_FPS,
    videoMaxFps: VIDEO_ANALYSIS_MAX_FPS,
    videoStepFps: VIDEO_ANALYSIS_FPS_STEP,
    minFps: Math.min(...FPS_OPTIONS),
    maxFps: Math.max(...FPS_OPTIONS),
  };
}

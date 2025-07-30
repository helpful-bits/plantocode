import { useState, useEffect } from 'react';

const VIDEO_RECORDING_SETTINGS_KEY = 'vibe-video-recording-settings';
const MIN_FPS = 1;
const MAX_FPS = 30;
const DEFAULT_FPS = 5;

interface VideoRecordingSettings {
  selectedAudioInputId: string;
  selectedFrameRate: number;
}

export function useVideoRecordingSettings() {
  const [selectedAudioInputId, setSelectedAudioInputId] = useState<string>('default');
  const [selectedFrameRate, setSelectedFrameRate] = useState<number>(DEFAULT_FPS);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(VIDEO_RECORDING_SETTINGS_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings) as VideoRecordingSettings;
        if (parsed.selectedAudioInputId) {
          setSelectedAudioInputId(parsed.selectedAudioInputId);
        }
        if (typeof parsed.selectedFrameRate === 'number' && 
            parsed.selectedFrameRate >= MIN_FPS && 
            parsed.selectedFrameRate <= MAX_FPS) {
          setSelectedFrameRate(parsed.selectedFrameRate);
        }
      } catch (error) {
        console.error('Failed to parse video recording settings:', error);
      }
    }
  }, []);

  // Save to localStorage whenever settings change
  const updateSelectedAudioInputId = (deviceId: string) => {
    setSelectedAudioInputId(deviceId);
    saveSettings({ selectedAudioInputId: deviceId, selectedFrameRate });
  };

  const updateSelectedFrameRate = (fps: number) => {
    // Clamp FPS to valid range
    const clampedFps = Math.max(MIN_FPS, Math.min(MAX_FPS, Math.round(fps)));
    setSelectedFrameRate(clampedFps);
    saveSettings({ selectedAudioInputId, selectedFrameRate: clampedFps });
  };

  const saveSettings = (settings: VideoRecordingSettings) => {
    try {
      localStorage.setItem(VIDEO_RECORDING_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save video recording settings:', error);
    }
  };

  return {
    selectedAudioInputId,
    setSelectedAudioInputId: updateSelectedAudioInputId,
    selectedFrameRate,
    setSelectedFrameRate: updateSelectedFrameRate,
    minFps: MIN_FPS,
    maxFps: MAX_FPS,
    defaultFps: DEFAULT_FPS,
  };
}
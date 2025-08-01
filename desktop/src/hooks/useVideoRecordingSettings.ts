import { useState, useEffect } from 'react';

export const FPS_OPTIONS = [5, 10, 15, 20, 25, 30];

export function useVideoRecordingSettings() {
  const [selectedAudioInputId, setSelectedAudioInputId] = useState<string>('default');
  const [selectedFrameRate, setSelectedFrameRate] = useState<number>(5);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedAudioDevice = localStorage.getItem('video-recording-audio-device');
    const savedFrameRate = localStorage.getItem('video-recording-frame-rate');

    if (savedAudioDevice) {
      setSelectedAudioInputId(savedAudioDevice);
    }

    if (savedFrameRate) {
      const parsedFrameRate = parseInt(savedFrameRate, 10);
      if (!isNaN(parsedFrameRate)) {
        setSelectedFrameRate(parsedFrameRate);
      }
    }
  }, []);

  // Save to localStorage whenever audio device changes
  const updateSelectedAudioInputId = (deviceId: string) => {
    setSelectedAudioInputId(deviceId);
    localStorage.setItem('video-recording-audio-device', deviceId);
  };

  // Save to localStorage whenever frame rate changes
  const updateSelectedFrameRate = (fps: number) => {
    setSelectedFrameRate(fps);
    localStorage.setItem('video-recording-frame-rate', fps.toString());
  };

  return {
    selectedAudioInputId,
    setSelectedAudioInputId: updateSelectedAudioInputId,
    selectedFrameRate,
    setSelectedFrameRate: updateSelectedFrameRate,
    FPS_OPTIONS,
    minFps: Math.min(...FPS_OPTIONS),
    maxFps: Math.max(...FPS_OPTIONS),
  };
}
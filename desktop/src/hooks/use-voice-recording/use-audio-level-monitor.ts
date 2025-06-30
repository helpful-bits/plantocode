"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseAudioLevelMonitorProps {
  stream: MediaStream | null;
  isActive: boolean;
  silenceThreshold?: number;
  onSilenceDetected?: (isSilent: boolean) => void;
}

export interface AudioLevelData {
  currentLevel: number;
  averageLevel: number;
  peakLevel: number;
  isSilent: boolean;
  frequency: Uint8Array;
}

export function useAudioLevelMonitor({
  stream,
  isActive,
  silenceThreshold = 0.01,
  onSilenceDetected,
}: UseAudioLevelMonitorProps) {
  const [audioLevel, setAudioLevel] = useState<AudioLevelData>({
    currentLevel: 0,
    averageLevel: 0,
    peakLevel: 0,
    isSilent: true,
    frequency: new Uint8Array(0),
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const levelHistoryRef = useRef<number[]>([]);
  const silenceStartTimeRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    levelHistoryRef.current = [];
    silenceStartTimeRef.current = null;
  }, []);

  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !isActive) {
      return;
    }

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const frequencyArray = new Uint8Array(bufferLength);
    
    analyserRef.current.getByteTimeDomainData(dataArray);
    analyserRef.current.getByteFrequencyData(frequencyArray);

    // Calculate RMS (Root Mean Square) for audio level
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const sample = (dataArray[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / bufferLength);
    const currentLevel = Math.max(0, Math.min(1, rms));

    // Track level history for average calculation
    levelHistoryRef.current.push(currentLevel);
    if (levelHistoryRef.current.length > 60) { // Keep last 60 frames (~1 second at 60fps)
      levelHistoryRef.current.shift();
    }

    const averageLevel = levelHistoryRef.current.reduce((a, b) => a + b, 0) / levelHistoryRef.current.length;
    const peakLevel = Math.max(...levelHistoryRef.current);

    // Silence detection
    const isSilent = currentLevel < silenceThreshold;
    const now = Date.now();

    if (isSilent) {
      if (silenceStartTimeRef.current === null) {
        silenceStartTimeRef.current = now;
      }
    } else {
      if (silenceStartTimeRef.current !== null) {
        silenceStartTimeRef.current = null;
        onSilenceDetected?.(false);
      }
    }

    // Trigger silence callback if silent for more than 2 seconds
    if (isSilent && silenceStartTimeRef.current && (now - silenceStartTimeRef.current) > 2000) {
      onSilenceDetected?.(true);
    }

    setAudioLevel({
      currentLevel,
      averageLevel,
      peakLevel,
      isSilent,
      frequency: frequencyArray,
    });

    if (isActive) {
      animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }
  }, [isActive, silenceThreshold, onSilenceDetected]);

  const setupAudioAnalysis = useCallback(async () => {
    if (!stream || !isActive) {
      return;
    }

    try {
      // Clean up previous instances
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Create audio context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume context if suspended (required by some browsers)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Create analyser
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      // Create source from stream
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);

      console.log("[AudioLevelMonitor] Audio analysis setup complete", {
        sampleRate: audioContextRef.current.sampleRate,
        fftSize: analyserRef.current.fftSize,
        frequencyBinCount: analyserRef.current.frequencyBinCount
      });

      // Start analyzing
      analyzeAudio();
    } catch (error) {
      console.error("[AudioLevelMonitor] Failed to setup audio analysis:", error);
    }
  }, [stream, isActive, analyzeAudio]);

  // Setup audio analysis when stream or active state changes
  useEffect(() => {
    if (stream && isActive) {
      setupAudioAnalysis();
    } else {
      cleanup();
      setAudioLevel({
        currentLevel: 0,
        averageLevel: 0,
        peakLevel: 0,
        isSilent: true,
        frequency: new Uint8Array(0),
      });
    }
  }, [stream, isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      levelHistoryRef.current = [];
      silenceStartTimeRef.current = null;
    };
  }, []);

  return {
    audioLevel,
    isAnalyzing: isActive && analyserRef.current !== null,
  };
}
"use client";

import { useState, useCallback } from "react";

export interface UseSessionMetadataProps {
  onInteraction: () => void;
  initialSessionName?: string;
  initialDiffTemperature?: number;
}

export interface UseSessionMetadataReturn {
  sessionName: string;
  diffTemperature: number;
  setSessionName: (name: string) => void;
  setDiffTemperature: (value: number) => void;
  reset: () => void;
}

/**
 * Hook to manage session metadata like name and temperature
 */
export function useSessionMetadata({
  onInteraction,
  initialSessionName = "Untitled Session",
  initialDiffTemperature = 0.7
}: UseSessionMetadataProps): UseSessionMetadataReturn {
  const [sessionName, setSessionNameState] = useState<string>(initialSessionName);
  const [diffTemperature, setDiffTemperatureState] = useState<number>(initialDiffTemperature);

  // Handler for changing session name
  const setSessionName = useCallback((name: string) => {
    setSessionNameState(name);
    onInteraction();
  }, [onInteraction]);

  // Handler for changing diffTemperature
  const setDiffTemperature = useCallback((value: number) => {
    setDiffTemperatureState(value);
    onInteraction();
  }, [onInteraction]);

  // Reset function to restore defaults
  const reset = useCallback(() => {
    setSessionNameState(initialSessionName);
    setDiffTemperatureState(initialDiffTemperature);
  }, [initialSessionName, initialDiffTemperature]);

  return {
    sessionName,
    diffTemperature,
    setSessionName,
    setDiffTemperature,
    reset
  };
}
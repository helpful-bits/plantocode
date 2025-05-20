"use client";

import { useState, useCallback } from "react";

export interface UseSessionMetadataProps {
  onInteraction: () => void;
  initialSessionName?: string;
}

export interface UseSessionMetadataReturn {
  sessionName: string;
  setSessionName: (name: string) => void;
  reset: () => void;
}

/**
 * Hook to manage session metadata like name
 */
export function useSessionMetadata({
  onInteraction,
  initialSessionName = "Untitled Session",
}: UseSessionMetadataProps): UseSessionMetadataReturn {
  const [sessionName, setSessionNameState] =
    useState<string>(initialSessionName);

  // Handler for changing session name
  const setSessionName = useCallback(
    (name: string) => {
      setSessionNameState(name);
      onInteraction();
    },
    [onInteraction]
  );

  // Reset function to restore defaults
  const reset = useCallback(() => {
    setSessionNameState(initialSessionName);
  }, [initialSessionName]);

  return {
    sessionName,
    setSessionName,
    reset,
  };
}

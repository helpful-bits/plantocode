"use client";

import { useCallback } from "react";
import { useSessionActionsContext } from "@/contexts/session";

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
 * Now integrates directly with SessionContext
 */
export function useSessionMetadata({
  onInteraction,
  initialSessionName = "Untitled Session",
}: UseSessionMetadataProps): UseSessionMetadataReturn {
  const sessionActions = useSessionActionsContext();

  // Handler for changing session name - updates SessionContext directly
  const setSessionName = useCallback(
    (name: string) => {
      sessionActions.updateCurrentSessionFields({ name });
      onInteraction();
    },
    [sessionActions, onInteraction]
  );

  // Reset function to restore defaults - updates SessionContext
  const reset = useCallback(() => {
    sessionActions.updateCurrentSessionFields({ name: initialSessionName });
  }, [sessionActions, initialSessionName]);

  return {
    sessionName: initialSessionName, // This is now passed from the consuming component that reads from SessionContext
    setSessionName,
    reset,
  };
}

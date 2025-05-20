import { useCallback } from "react";

import { useSessionActionsContext } from "@/contexts/session";

export interface UseGeneratePromptSessionProps {
  activeSessionId: string | null;
  isRestoringSession: boolean;
  sessionInitialized: boolean;
}

export interface UseGeneratePromptSessionReturn {
  handleInteraction: () => void;
  startSaveSession: () => Promise<void>;
}

export function useGeneratePromptSession({
  activeSessionId,
  isRestoringSession,
  sessionInitialized,
}: UseGeneratePromptSessionProps): UseGeneratePromptSessionReturn {
  const sessionActions = useSessionActionsContext();

  const handleInteraction = useCallback(() => {
    if (activeSessionId && sessionInitialized && !isRestoringSession) {
      sessionActions.setSessionModified(true);
    }
  }, [activeSessionId, isRestoringSession, sessionInitialized, sessionActions]);

  const startSaveSession = useCallback(async (): Promise<void> => {
    if (activeSessionId && sessionInitialized) {
      await sessionActions.saveCurrentSession();
    }
  }, [activeSessionId, sessionInitialized, sessionActions]);

  return {
    handleInteraction,
    startSaveSession,
  };
}

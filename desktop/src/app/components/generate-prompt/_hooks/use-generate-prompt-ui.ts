import { useState } from "react";

export interface GeneratePromptUIState {
  error: string;
  isFormSaving: boolean;
  showPrompt: boolean;
  isStateLoaded: boolean;
  sessionInitialized: boolean;
  isRestoringSession: boolean;

  setError: (error: string) => void;
  setIsFormSaving: (saving: boolean) => void;
  setShowPrompt: (show: boolean) => void;
  setIsStateLoaded: (loaded: boolean) => void;
  setSessionInitialized: (initialized: boolean) => void;
  setIsRestoringSession: (restoring: boolean) => void;
}

export function useGeneratePromptUI(): GeneratePromptUIState {
  const [error, setError] = useState<string>("");
  const [isFormSaving, setIsFormSaving] = useState<boolean>(false);
  const [showPrompt, setShowPrompt] = useState<boolean>(false);
  const [isStateLoaded, setIsStateLoaded] = useState<boolean>(false);
  const [sessionInitialized, setSessionInitialized] = useState<boolean>(false);
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(false);

  return {
    error,
    isFormSaving,
    showPrompt,
    isStateLoaded,
    sessionInitialized,
    isRestoringSession,

    setError,
    setIsFormSaving,
    setShowPrompt,
    setIsStateLoaded,
    setSessionInitialized,
    setIsRestoringSession,
  };
}

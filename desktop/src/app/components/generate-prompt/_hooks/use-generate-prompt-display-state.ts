"use client";

import { useState, useCallback } from "react";

export interface UseGeneratePromptDisplayStateProps {
  taskDescription: string;
}

/**
 * Hook for managing display state for generate prompt feature
 * This is a simplified version that no longer handles generating the actual prompts
 * as that logic has been moved to the backend
 */
export function useGeneratePromptDisplayState({
  taskDescription: _taskDescription, // Rename to mark as unused
}: UseGeneratePromptDisplayStateProps) {
  // UI state for showing prompt preview (if needed)
  const [showPrompt, setShowPrompt] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [pastedPaths, _setPastedPaths] = useState("");
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>(
    []
  );
  const [error, setError] = useState<string | null>(null);
  const [generatePromptFn, setGeneratePrompt] = useState<() => Promise<void>>(
    () => async () => {}
  );
  const [_copyPromptFn, setCopyPrompt] = useState<() => Promise<void>>(
    () => async () => {}
  );

  // Prompt and token count state
  const [promptText, setPrompt] = useState("");
  const [tokenCount, setTokenCount] = useState(0);

  // Copy action is now simplified (would only be useful if the backend provides a preview)
  const copyPrompt = useCallback(async () => {
    if (promptText) {
      try {
        await navigator.clipboard.writeText(promptText);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error("Failed to copy prompt:", err);
      }
    }
  }, [promptText]);

  // Generate prompt action
  const generatePrompt = useCallback(async () => {
    if (generatePromptFn) {
      await generatePromptFn();
    }
  }, [generatePromptFn]);

  return {
    // Display state
    prompt: promptText,
    tokenCount,
    copySuccess,
    showPrompt,
    pastedPaths,
    externalPathWarnings,
    error,

    // Actions
    setShowPrompt,
    copyPrompt,
    setPrompt,
    setTokenCount,
    setError,
    setExternalPathWarnings,
    generatePrompt,
    setCopyPrompt,
    setGeneratePrompt,
  };
}

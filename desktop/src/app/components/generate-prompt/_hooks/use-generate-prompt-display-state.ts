"use client";

import { useState, useCallback, useMemo } from "react";

export interface UseGeneratePromptDisplayStateProps {
}

/**
 * Hook for managing display state for generate prompt feature
 * This is a simplified version that no longer handles generating the actual prompts
 * as that logic has been moved to the backend
 */
export function useGeneratePromptDisplayState({}: UseGeneratePromptDisplayStateProps = {}) {
  // UI state for showing prompt preview (if needed)
  const [showPrompt, setShowPrompt] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [externalPathWarnings, setExternalPathWarnings] = useState<string[]>(
    []
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


  return useMemo(
    () => ({
      // Display state
      prompt: promptText,
      tokenCount,
      copySuccess,
      showPrompt,
      externalPathWarnings,

      // Actions
      setShowPrompt,
      copyPrompt,
      setPrompt,
      setTokenCount,
      setExternalPathWarnings,
    }),
    [
      promptText,
      tokenCount,
      copySuccess,
      showPrompt,
      externalPathWarnings,
      setShowPrompt,
      copyPrompt,
      setPrompt,
      setTokenCount,
      setExternalPathWarnings,
    ]
  );
}

"use client";

import { useState, useCallback } from "react";
import { getImplementationPlanPromptAction } from "@/actions/ai/implementation-plan.actions";

interface PromptData {
  systemPrompt: string;
  userPrompt: string;
  combinedPrompt: string;
}

interface UsePromptCopyModalReturn {
  isOpen: boolean;
  isLoading: boolean;
  error: string | undefined;
  promptData: PromptData | null;
  openModal: (params: {
    sessionId: string;
    taskDescription: string;
    projectDirectory: string;
    relevantFiles: string[];
    projectStructure?: string;
  }) => Promise<void>;
  closeModal: () => void;
}

export function usePromptCopyModal(): UsePromptCopyModalReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [promptData, setPromptData] = useState<PromptData | null>(null);

  const openModal = useCallback(async (params: {
    sessionId: string;
    taskDescription: string;
    projectDirectory: string;
    relevantFiles: string[];
    projectStructure?: string;
  }) => {
    setIsOpen(true);
    setIsLoading(true);
    setError(undefined);
    setPromptData(null);

    try {
      const result = await getImplementationPlanPromptAction(params);
      
      if (result.isSuccess && result.data) {
        setPromptData(result.data);
      } else {
        setError(result.message || "Failed to load prompt");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setError(undefined);
    setPromptData(null);
  }, []);

  return {
    isOpen,
    isLoading,
    error,
    promptData,
    openModal,
    closeModal,
  };
}
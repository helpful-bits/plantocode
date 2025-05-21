"use client";

import { useState, useCallback, useEffect } from "react";

import { generateTaskPromptTemplateAction } from "@/actions";

// Simple token estimation function
function estimateTokens(text: string): number {
  // Estimate based on ~4 chars per token
  return Math.ceil((text || "").length / 4); // Handle potential null/undefined text
}

interface UsePromptTemplatingProps {
  taskDescription: string;
  relevantFiles: string[];
  fileContents: Record<string, string>;
  projectDirectory: string;
}

interface UsePromptTemplatingResult {
  prompt: string;
  tokenCount: number;
  isGenerating: boolean;
  copySuccess: boolean;
  error: string;
  generatePrompt: () => Promise<void>;
  copyPrompt: () => Promise<void>;
}

export function usePromptTemplating({
  taskDescription,
  relevantFiles,
  fileContents,
  projectDirectory,
}: UsePromptTemplatingProps): UsePromptTemplatingResult {
  const [prompt, setPrompt] = useState("");
  const [tokenCount, setTokenCount] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [error, setError] = useState("");

  // Estimate tokens whenever prompt changes
  useEffect(() => {
    const updateTokenCount = () => {
      if (prompt) {
        const count = estimateTokens(prompt);
        setTokenCount(count);
      } else {
        setTokenCount(0);
      }
    };

    void updateTokenCount();
  }, [prompt]);

  // Generate prompt template
  const generatePrompt = useCallback(async () => {
    if (!taskDescription.trim()) {
      setError("Task description cannot be empty");
      return;
    }

    if (relevantFiles.length === 0) {
      setError("No files selected for prompt generation");
      return;
    }

    setIsGenerating(true);
    setError("");
    setPrompt("");
    setCopySuccess(false);

    try {
      // Get the complete prompt template with formatted file contents
      const templateResult = await generateTaskPromptTemplateAction({
        originalDescription: taskDescription,
        relevantFiles,
        fileContents,
        projectDirectory,
      });

      if (!templateResult.isSuccess || !templateResult.data) {
        setError(
          `Failed to generate template instructions: ${templateResult.message}`
        );
        return;
      }

      // Set the prompt directly from the template result
      setPrompt(templateResult.data);

      // Estimate tokens
      const tokenEstimate = estimateTokens(templateResult.data);
      setTokenCount(tokenEstimate);
    } catch (err) {
      console.error("Error during prompt generation:", err);
      setError("Failed to generate prompt");
    } finally {
      setIsGenerating(false);
    }
  }, [taskDescription, relevantFiles, fileContents, projectDirectory]);

  // Copy prompt to clipboard
  const copyPrompt = useCallback(async () => {
    if (!prompt) {
      setError("No prompt to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(prompt);
      setCopySuccess(true);

      // Reset success indicator after 2 seconds
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Error copying to clipboard:", err);
      setError("Failed to copy to clipboard");
    }
  }, [prompt]);

  return {
    prompt,
    tokenCount,
    isGenerating,
    copySuccess,
    error,
    generatePrompt,
    copyPrompt,
  };
}

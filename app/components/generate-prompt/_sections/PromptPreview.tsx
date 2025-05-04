"use client";

import React from "react";
import { Button } from "@/components/ui/button";

type PromptPreviewState = {
  prompt: string;
  error?: string;
  isLoading?: boolean;
  copySuccess: boolean;
  showPrompt: boolean;
  tokenCount: number;
  isCopyingPrompt: boolean;
  promptPreviewRef?: React.RefObject<HTMLDivElement>;
};

interface PromptPreviewProps {
  state: PromptPreviewState;
  actions: {
    copyPrompt: () => Promise<void>;
    togglePromptView: () => void;
    handleSetCustomPrompt?: (prompt: string) => void;
  };
}

export default function PromptPreview({ state, actions }: PromptPreviewProps) {
  const { prompt, error, isLoading, copySuccess, showPrompt } = state;
  const { copyPrompt, togglePromptView } = actions;

  if (!prompt && !error && !isLoading) {
    return null;
  }

  return (
    <>
      {/* Error message */}
      {error && (
        <div className="text-red-500 bg-red-50 p-4 rounded border border-red-200 mb-4">
          <p className="font-medium">Error:</p>
          <p>{error}</p>
        </div>
      )}

      {/* Prompt preview */}
      {prompt && !isLoading && showPrompt && (
        <div className="bg-muted p-4 rounded-lg mt-6 relative border shadow-inner">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold mb-2">Generated Prompt Preview</h2>
            <Button
              type="button"
              onClick={copyPrompt}
              variant={copySuccess ? "outline" : "secondary"}
              size="sm"
              className="text-xs"
            >
              {copySuccess ? "Copied!" : "Copy to Clipboard"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1 mb-3">Copies the generated prompt text to your clipboard.</p>
          <pre className="bg-background p-4 rounded-md overflow-auto whitespace-pre-wrap text-xs max-h-[650px]">
            {prompt}
          </pre>
        </div>
      )}

      {/* Toggle button for prompt visibility */}
      {prompt && !isLoading && !showPrompt && (
        <div className="mt-6">
          <Button
            type="button"
            onClick={togglePromptView}
            variant="outline"
            size="sm"
          >
            Show Prompt Preview
          </Button>
        </div>
      )}
    </>
  );
} 
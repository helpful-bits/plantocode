"use client";

import React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FilesMap } from "../_hooks/use-file-selection-state";

interface ActionSectionProps {
  state: {
    isLoading: boolean;
    isLoadingFiles: boolean;
    hasUnsavedChanges: boolean;
    diffTemperature: number;
    tokenCount: number;
    taskDescription: string;
    projectDirectory: string | null;
    prompt: string;
    isGenerating: boolean;
    isCustomPromptMode: boolean;
    allFilesMap: FilesMap;
    isFormSaving?: boolean;
  };
  actions: {
    generatePrompt: () => Promise<void>;
    setDiffTemperature: (value: number) => void;
    handleInteraction: () => void;
    handleSetDiffTemperature: (value: number) => void;
    copyPrompt: () => Promise<void>;
    handleSaveSessionState: () => Promise<void>;
    handleToggleCustomPromptMode: () => void;
    handleGenerateGuidance: () => Promise<void>;
    handleGenerateCodebase: () => Promise<void>;
  };
}

export default function ActionSection({ state, actions }: ActionSectionProps) {
  const { isLoading, isLoadingFiles, hasUnsavedChanges, diffTemperature, tokenCount, isFormSaving } = state;
  const { generatePrompt, setDiffTemperature, handleSaveSessionState } = actions;

  return (
    <div className="flex flex-col pt-4">
      <div className="flex flex-col space-y-2 mb-2">
        <div className="flex items-center justify-between">
          <div className="text-sm">Plan Generation Temperature: {diffTemperature.toFixed(2)}</div>
          <div className="w-64">
            <Slider 
              value={[diffTemperature]} 
              min={0} 
              max={1.0} 
              step={0.05}
              onValueChange={(values: number[]) => setDiffTemperature(values[0])}
            />
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Controls the creativity/randomness of the generated plan. Lower values (e.g., 0.2) are more deterministic, higher values (e.g., 0.9) are more creative.
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="italic">Changes will be saved automatically</span>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSaveSessionState}
              disabled={isFormSaving || !hasUnsavedChanges}
              className="h-7"
            >
              {isFormSaving ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-3 w-3 mr-1" />
                  Save Session
                </>
              )}
            </Button>
          </div>
          
          <div className="flex flex-col">
            <Button
              type="button"
              variant="default"
              onClick={generatePrompt}
              disabled={isLoading || isLoadingFiles}
              className="px-6"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  Generating...
                </>
              ) : (
                "Generate Plan"
              )}
            </Button>
            <div className="text-xs text-muted-foreground mt-1">
              Generates the structured plan based on the task description and selected file context. This plan can then be processed by Gemini or copied.
            </div>
          </div>
        </div>
      </div>

      {tokenCount > 0 && (
        <div className="text-xs text-muted-foreground text-right">
          Estimated token count: {tokenCount.toLocaleString()}
        </div>
      )}
    </div>
  );
} 
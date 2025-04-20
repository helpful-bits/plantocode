"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface ActionSectionProps {
  state: {
    isLoading: boolean;
    isLoadingFiles: boolean;
    hasUnsavedChanges: boolean;
    diffTemperature: number;
    tokenCount: number;
  };
  actions: {
    generatePrompt: () => Promise<void>;
    setDiffTemperature: (value: number) => void;
  };
}

export default function ActionSection({ state, actions }: ActionSectionProps) {
  const { isLoading, isLoadingFiles, hasUnsavedChanges, diffTemperature, tokenCount } = state;
  const { generatePrompt, setDiffTemperature } = actions;

  return (
    <div className="flex flex-col pt-4">
      <div className="flex flex-col space-y-2 mb-2">
        <div className="flex items-center justify-between">
          <div className="text-sm">Diff Temperature: {diffTemperature.toFixed(2)}</div>
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

        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {hasUnsavedChanges && (
              <span className="italic">Changes will be saved automatically</span>
            )}
          </div>
          
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
              "Generate Prompt"
            )}
          </Button>
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
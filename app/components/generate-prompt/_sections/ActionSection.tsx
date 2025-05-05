"use client";

import React from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";

const ActionSection = React.memo(function ActionSection() {
  const context = useGeneratePrompt();
  const fileState = useFileManagement();
  
  // Extract values from context
  const {
    taskState,
    projectDirectory,
    isFormSaving,
    hasUnsavedChanges,
    diffTemperature,
    setDiffTemperature,
    saveSessionState,
    activeSessionId,
    handleGenerateGuidance,
    handleGenerateCodebase
  } = context;

  // Compute whether we can generate guidance
  const canGenerateGuidance = Boolean(
    projectDirectory && 
    taskState.taskDescription.trim() && 
    fileState.includedPaths.length > 0
  );
  
  // Handler for saving session
  const handleSave = () => {
    if (activeSessionId) {
      // Get current file state for saving with the session
      const currentFileState = fileState.getFileStateForSession();
      saveSessionState(activeSessionId, undefined, currentFileState);
    }
  };

  return (
    <div className="space-y-3 bg-card p-4 rounded-lg border shadow-sm">
      <div>
        <h2 className="font-bold">Model Options</h2>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">
              Temperature: {diffTemperature.toFixed(1)}
            </label>
            <div className="flex gap-2 items-center">
              <span className="text-xs">0.1</span>
              <Slider
                value={[diffTemperature]}
                min={0.1}
                max={1.0}
                step={0.1}
                onValueChange={(vals) => {
                  if (vals[0] !== undefined) {
                    setDiffTemperature(vals[0]);
                  }
                }}
                className="flex-1"
                aria-label="Temperature"
              />
              <span className="text-xs">1.0</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Lower values (0.1-0.3) for more consistent, deterministic results.
              Higher values (0.7-1.0) for more creative, varied outputs.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center gap-2">
          <Button
            variant="default"
            onClick={handleSave}
            disabled={isFormSaving || !hasUnsavedChanges || !activeSessionId}
            className="flex-1"
          >
            {isFormSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save {hasUnsavedChanges ? "(Unsaved Changes)" : ""}
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-col items-start gap-2 mt-4">
          <Button
            variant="outline"
            className="flex-1 w-full"
            onClick={handleGenerateGuidance}
            disabled={!canGenerateGuidance}
            title={
              !projectDirectory
                ? "Please select a project directory first"
                : !taskState.taskDescription.trim()
                ? "Please provide a task description first"
                : fileState.includedPaths.length === 0
                ? "Please select at least one file first"
                : "Generate guidance for solving the task based on selected files"
            }
          >
            Generate Implementation Guidance
          </Button>

          <Button
            variant="outline"
            className="flex-1 w-full"
            onClick={handleGenerateCodebase}
            disabled={!projectDirectory}
          >
            Generate Codebase
          </Button>

          <p className="text-xs text-muted-foreground mt-1">
            These actions use AI to generate guidance or a codebase for your task.
          </p>
        </div>
      </div>
    </div>
  );
});

export default ActionSection;
"use client";

import { Sparkles, Undo2, Redo2 } from "lucide-react";
import React from "react";

import { useSessionStateContext } from "@/contexts/session";
import { SearchScopeToggle } from "@/ui";
import { Button } from "@/ui/button";

import FindModeToggle from "../_components/find-mode-toggle";
import { useCorePromptContext } from "../_contexts/core-prompt-context";

interface ActionsSectionProps {
  isFindingFiles: boolean;
  executeFindRelevantFiles: () => Promise<void>;
  findFilesMode: "ai" | "manual";
  setFindFilesMode: (mode: "ai" | "manual") => void;
  searchSelectedFilesOnly: boolean;
  toggleSearchSelectedFilesOnly: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoSelection: () => void;
  redoSelection: () => void;
  disabled?: boolean;
  onInteraction?: () => void;
}

const ActionsSection = React.memo(function ActionsSection({
  isFindingFiles,
  executeFindRelevantFiles,
  findFilesMode,
  setFindFilesMode,
  searchSelectedFilesOnly,
  toggleSearchSelectedFilesOnly,
  canUndo,
  canRedo,
  undoSelection,
  redoSelection,
  disabled = false,
}: ActionsSectionProps) {
  // Get states and actions from the granular contexts
  const { currentSession } = useSessionStateContext();
  const {} = useCorePromptContext();

  const taskDescription = currentSession?.taskDescription || "";

  return (
    <div className="space-y-4">
      <div className="bg-card p-6 rounded-lg border shadow-sm">
        <h3 className="text-lg font-semibold mb-3 text-foreground">File Search Options</h3>

        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <FindModeToggle
                currentMode={findFilesMode === "ai" ? "replace" : "extend"}
                onModeChange={(_mode: "replace" | "extend") =>
                  setFindFilesMode("ai")
                }
                disabled={disabled || !taskDescription}
              />

              <div className="mt-1">
                <SearchScopeToggle
                  searchSelectedFilesOnly={searchSelectedFilesOnly}
                  onToggle={toggleSearchSelectedFilesOnly}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={undoSelection}
                disabled={!canUndo || disabled}
                title="Undo last file selection"
              >
                <Undo2 className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon-sm"
                onClick={redoSelection}
                disabled={!canRedo || disabled}
                title="Redo undone file selection"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>


          <Button
            variant="default"
            size="sm"
            onClick={executeFindRelevantFiles}
            disabled={
              disabled ||
              isFindingFiles ||
              !taskDescription.trim()
            }
            isLoading={isFindingFiles}
            loadingText="Finding files..."
            className="w-full"
          >
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Find Relevant Files with AI
            </>
          </Button>
        </div>
      </div>
    </div>
  );
});

ActionsSection.displayName = "ActionsSection";

export default ActionsSection;
"use client";

import { Sparkles, Undo2, Redo2, HelpCircle } from "lucide-react";
import React, { useState } from "react";

import { useSessionStateContext } from "@/contexts/session";
import { SearchScopeToggle } from "@/ui";
import { Button } from "@/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";

import { useCorePromptContext } from "../_contexts/core-prompt-context";
import FindModeToggle from "../_components/find-mode-toggle";

interface ActionsSectionProps {
  isFindingFiles: boolean;
  executeFindRelevantFiles: () => Promise<void>;
  findFilesMode: "replace" | "extend";
  setFindFilesMode: (mode: "replace" | "extend") => void;
  searchSelectedFilesOnly: boolean;
  toggleSearchSelectedFilesOnly: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoSelection: () => void;
  redoSelection: () => void;
  cancelFind: () => void;
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
  cancelFind,
}: ActionsSectionProps) {
  // State for controlling tooltip visibility
  const [showFindFilesHelpTooltip, setShowFindFilesHelpTooltip] = useState(false);
  
  // Get states and actions from the granular contexts
  const { currentSession } = useSessionStateContext();
  const {
    state: { lifecycleStatus },
  } = useCorePromptContext();

  const taskDescription = currentSession?.taskDescription || "";

  return (
    <div className="space-y-4">
      <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
        <h3 className="text-lg font-semibold mb-3 text-foreground">File Search Options</h3>

        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <FindModeToggle
                currentMode={findFilesMode}
                onModeChange={setFindFilesMode}
                disabled={lifecycleStatus !== 'READY' || !taskDescription}
              />

              <div className="mt-1">
                <SearchScopeToggle
                  searchSelectedFilesOnly={searchSelectedFilesOnly}
                  onToggle={toggleSearchSelectedFilesOnly}
                  disabled={lifecycleStatus !== 'READY'}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={undoSelection}
                disabled={!canUndo || lifecycleStatus !== 'READY'}
                title="Undo last file selection"
              >
                <Undo2 className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="icon-sm"
                onClick={redoSelection}
                disabled={!canRedo || lifecycleStatus !== 'READY'}
                title="Redo undone file selection"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>


          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={executeFindRelevantFiles}
              disabled={
                lifecycleStatus !== 'READY' ||
                isFindingFiles ||
                !taskDescription.trim()
              }
              isLoading={isFindingFiles}
              loadingText="AI is working..."
              className="flex-grow"
            >
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Find Relevant Files
              </>
            </Button>
            
            <Tooltip open={showFindFilesHelpTooltip} onOpenChange={setShowFindFilesHelpTooltip}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  disabled={false}
                  onClick={() => setShowFindFilesHelpTooltip(!showFindFilesHelpTooltip)}
                >
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="max-w-xs space-y-2">
                  <p>
                    AI analyzes your task description and project structure to automatically find and select the most relevant files for your request
                  </p>
                  <p className="text-xs font-medium border-t border-primary-foreground/20 pt-2">
                    Saves time by intelligently filtering through your entire codebase
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
            
            {isFindingFiles && (
              <Button
                variant="outline"
                size="sm"
                onClick={cancelFind}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ActionsSection.displayName = "ActionsSection";

export default ActionsSection;
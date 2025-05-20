"use client";

import { Sparkles, Undo2, Redo2 } from "lucide-react";
import React from "react";

import { SearchScopeToggle } from "@/ui";
import { Button } from "@/ui/button";

import FindModeToggle from "../_components/find-mode-toggle";
import RegexAccordion from "../_components/regex-accordion";
import { useCorePromptContext } from "../_contexts/core-prompt-context";
// Removed unused import
import { useRegexContext } from "../_contexts/regex-context";
import { useTaskContext } from "../_contexts/task-context";

interface ActionsSectionProps {
  titleRegexError: string | null;
  contentRegexError: string | null;
  negativeTitleRegexError: string | null;
  negativeContentRegexError: string | null;
  isFindingFiles: boolean;
  executeFindRelevantFiles: () => Promise<void>;
  findFilesMode: "ai" | "manual";
  setFindFilesMode: (mode: "ai" | "manual") => void;
  searchSelectedFilesOnly: boolean;
  toggleSearchSelectedFilesOnly: () => void;
  // Prefix with underscore to mark as deliberately unused
  _includedFilesCount: number;
  canUndo: boolean;
  canRedo: boolean;
  undoSelection: () => void;
  redoSelection: () => void;
  disabled?: boolean;
  onInteraction?: () => void;
}

const ActionsSection = React.memo(function ActionsSection({
  titleRegexError,
  contentRegexError,
  negativeTitleRegexError,
  negativeContentRegexError,
  isFindingFiles,
  executeFindRelevantFiles,
  findFilesMode,
  setFindFilesMode,
  searchSelectedFilesOnly,
  toggleSearchSelectedFilesOnly,
  _includedFilesCount: _, // Rename the param to underscore to explicitly mark as unused
  canUndo,
  canRedo,
  undoSelection,
  redoSelection,
  disabled = false,
}: ActionsSectionProps) {
  // Get states and actions from the granular contexts
  const {
    state: { taskDescription },
  } = useTaskContext();
  const { state: regexState } = useRegexContext();
  const {
    actions: { handleInteraction },
  } = useCorePromptContext();

  return (
    <div className="space-y-4">
      <div className="bg-card p-6 rounded-lg border shadow-sm">
        <h3 className="text-sm font-medium mb-3">File Search Options</h3>

        <div className="flex flex-col space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <FindModeToggle
                currentMode={findFilesMode === "ai" ? "replace" : "extend"}
                onModeChange={(mode) =>
                  setFindFilesMode(mode === "replace" ? "ai" : "manual")
                }
                disabled={disabled || !taskDescription}
              />

              <div className="mt-1">
                <SearchScopeToggle
                  searchSelectedFilesOnly={searchSelectedFilesOnly}
                  onToggle={toggleSearchSelectedFilesOnly}
                  disabled={disabled || findFilesMode !== "manual"}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={undoSelection}
                disabled={!canUndo || disabled}
                title="Undo last file selection"
                className="h-8 w-8 p-0"
              >
                <Undo2 className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={redoSelection}
                disabled={!canRedo || disabled}
                title="Redo undone file selection"
                className="h-8 w-8 p-0"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <RegexAccordion
            titleRegexError={titleRegexError}
            contentRegexError={contentRegexError}
            negativeTitleRegexError={negativeTitleRegexError}
            negativeContentRegexError={negativeContentRegexError}
            hasTaskDescription={!!taskDescription}
            disabled={disabled || findFilesMode !== "manual"}
            onInteraction={handleInteraction}
          />

          <Button
            variant="default"
            size="sm"
            onClick={executeFindRelevantFiles}
            disabled={
              disabled ||
              (findFilesMode === "ai" && !taskDescription) ||
              (findFilesMode === "manual" && !regexState.isRegexActive) ||
              isFindingFiles
            }
            isLoading={isFindingFiles}
            loadingText="Finding files..."
            className="w-full h-9 flex justify-center items-center"
          >
            {findFilesMode === "ai" ? (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Find Relevant Files with AI
              </>
            ) : (
              <>Find Files with Regex</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

export default ActionsSection;
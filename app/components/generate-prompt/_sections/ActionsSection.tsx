"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Undo2, Redo2 } from "lucide-react";
import RegexAccordion from "../_components/regex-accordion";
import FindModeToggle from "../_components/find-mode-toggle";
import SearchScopeToggle from "../_components/search-scope-toggle";
import { GeneratePromptContextValue } from "../_contexts/generate-prompt-context";

interface ActionsSectionProps {
  regexState: GeneratePromptContextValue['regexState'];
  taskDescription: string;
  titleRegexError: string | null;
  contentRegexError: string | null;
  negativeTitleRegexError: string | null;
  negativeContentRegexError: string | null;
  isFindingFiles: boolean;
  executeFindRelevantFiles: () => void;
  findFilesMode: 'replace' | 'extend';
  setFindFilesMode: (mode: 'replace' | 'extend') => void;
  searchSelectedFilesOnly: boolean;
  toggleSearchSelectedFilesOnly: (value?: boolean) => void;
  includedFilesCount: number;
  canUndo: boolean;
  canRedo: boolean;
  undoSelection: () => void;
  redoSelection: () => void;
  onInteraction: () => void;
  disabled?: boolean;
}

const ActionsSection = React.memo(function ActionsSection({
  regexState,
  taskDescription,
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
  includedFilesCount,
  canUndo,
  canRedo,
  undoSelection,
  redoSelection,
  onInteraction,
  disabled = false
}: ActionsSectionProps) {
  // Check if task description is valid for finding files
  const hasTaskDescription = !!taskDescription?.trim();

  // Description based on current mode
  const findButtonDescription = findFilesMode === 'replace'
    ? "Replace current selection with AI-found files"
    : "Add AI-found files to current selection";

  return (
    <div className="border rounded-lg p-5 bg-card shadow-sm w-full mb-4">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-4">
          {/* Find Relevant Files Button */}
          <Button
            type="button"
            variant={!hasTaskDescription ? "destructive" : "default"}
            size="sm"
            onClick={executeFindRelevantFiles}
            disabled={isFindingFiles || !hasTaskDescription || disabled}
            className="h-9"
            title={disabled ? "Feature disabled during session switching" :
                  !hasTaskDescription ? "Task description required to find relevant files" :
                  findButtonDescription}
          >
            {isFindingFiles ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {isFindingFiles ? "Finding Files..." : "Find Relevant Files"}
          </Button>

          {/* Search Scope Toggle - added this component */}
          <SearchScopeToggle
            searchSelectedFilesOnly={searchSelectedFilesOnly}
            onToggle={toggleSearchSelectedFilesOnly}
            includedCount={includedFilesCount}
            disabled={disabled || isFindingFiles}
          />

          {/* Replace/Extend Mode Toggle */}
          <FindModeToggle
            currentMode={findFilesMode}
            onModeChange={setFindFilesMode}
            disabled={disabled || isFindingFiles}
          />

          {/* Undo/Redo Buttons */}
          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={undoSelection}
              disabled={!canUndo || disabled}
              className="h-8 w-8"
              title="Undo file selection change"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={redoSelection}
              disabled={!canRedo || disabled}
              className="h-8 w-8"
              title="Redo file selection change"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Helper text for the actions */}
      <div className="text-xs text-muted-foreground mb-4 flex flex-wrap gap-2">
        <span className="text-primary-foreground bg-primary/80 px-2 py-0.5 rounded-sm font-medium min-w-[220px] inline-block text-center">
          {findFilesMode === 'replace'
            ? "Mode: Replace existing files with AI results"
            : "Mode: Add AI results to existing selection"}
        </span>
        <span>·</span>
        <span className="text-primary-foreground bg-primary/80 px-2 py-0.5 rounded-sm font-medium min-w-[180px] inline-block text-center">
          {searchSelectedFilesOnly
            ? "Scope: Selected files only"
            : "Scope: All project files"}
        </span>
        <span>·</span>
        <span>Use Undo/Redo to navigate through your selection history</span>
      </div>

      {/* RegexAccordion */}
      <RegexAccordion
        regexState={regexState}
        onInteraction={onInteraction}
        taskDescription={taskDescription}
        titleRegexError={titleRegexError}
        contentRegexError={contentRegexError}
        negativeTitleRegexError={negativeTitleRegexError}
        negativeContentRegexError={negativeContentRegexError}
        disabled={disabled}
      />
    </div>
  );
});

export default ActionsSection;
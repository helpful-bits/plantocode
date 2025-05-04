"use client";

import React, { useEffect } from "react";
import PastePaths from "../paste-paths";
import FileBrowser from "../file-browser";
import { FilesMap } from "../_hooks/use-file-selection-state";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";

interface FileSectionProps {
  state: {
    allFilesMap: FilesMap;
    fileContentsMap: Record<string, string>;
    searchTerm: string;
    titleRegex: string;
    contentRegex: string;
    negativeTitleRegex: string;
    negativeContentRegex: string;
    isRegexActive: boolean;
    pastedPaths: string;
    projectDirectory: string;
    isLoadingFiles: boolean;
    loadingStatus: string;
    isFindingFiles: boolean;
    externalPathWarnings: string[];
    titleRegexError: string | null;
    contentRegexError: string | null;
    negativeTitleRegexError: string | null;
    negativeContentRegexError: string | null;
    taskDescription: string;
    showOnlySelected: boolean;
  };
  actions: {
    handleFilesMapChange: (filesMap: FilesMap) => void;
    handleSearchChange: (value: string) => void;
    handlePastedPathsChange: (value: string) => void;
    handlePathsPreview: (paths: string[]) => void;
    handleAddPathToPastedPaths: (path: string) => Promise<void>;
    handleFindRelevantFiles?: () => Promise<void>;
    copyArchPrompt: () => Promise<void>;
    handleInteraction: () => Promise<void>;
    setTitleRegexError?: (error: string | null) => void;
    setContentRegexError?: (error: string | null) => void;
    setNegativeTitleRegexError?: (error: string | null) => void;
    setNegativeContentRegexError?: (error: string | null) => void;
    toggleShowOnlySelected: () => void;
    refreshFiles?: () => Promise<void>;
    saveFileSelections: () => Promise<void>;
    toggleFileSelection: (path: string) => void;
  };
}

export default function FileSection({ state, actions }: FileSectionProps) {
  const {
    allFilesMap,
    fileContentsMap,
    searchTerm,
    titleRegex,
    contentRegex,
    negativeTitleRegex,
    negativeContentRegex,
    isRegexActive,
    pastedPaths,
    projectDirectory,
    isLoadingFiles,
    loadingStatus,
    isFindingFiles,
    externalPathWarnings,
    titleRegexError,
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError,
    taskDescription,
    showOnlySelected
  } = state;

  // Log pastedPaths for debugging
  useEffect(() => {
    console.log("[FileSection] pastedPaths:", pastedPaths);
  }, [pastedPaths]);

  const {
    handleFilesMapChange,
    handleSearchChange,
    handlePastedPathsChange,
    handlePathsPreview,
    handleAddPathToPastedPaths,
    handleFindRelevantFiles,
    copyArchPrompt,
    handleInteraction,
    setTitleRegexError,
    setContentRegexError,
    setNegativeTitleRegexError,
    setNegativeContentRegexError,
    toggleShowOnlySelected,
    refreshFiles,
    saveFileSelections,
    toggleFileSelection
  } = actions;

  return (
    <>
      <PastePaths
        onChange={handlePastedPathsChange}
        value={pastedPaths}
        projectDirectory={projectDirectory}
        onInteraction={handleInteraction}
        onParsePaths={handlePathsPreview}
        warnings={externalPathWarnings}
        canCorrectPaths={!!projectDirectory}
        isFindingFiles={isFindingFiles}
        canFindFiles={!!taskDescription.trim() && !!projectDirectory}
        onFindRelevantFiles={handleFindRelevantFiles}
        onGenerateGuidance={copyArchPrompt}
      >
        <div className="flex justify-between items-center gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleFindRelevantFiles}
            disabled={!taskDescription.trim() || !projectDirectory || isFindingFiles}
            className="w-1/2"
            title={!taskDescription.trim() ? "Please enter a task description first" : 
                  !projectDirectory ? "Please select a project directory first" : 
                  "Find files relevant to your task using AI"}
          >
            {isFindingFiles ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Finding Files...
              </>
            ) : pastedPaths.trim() ? (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Find More Files
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Find Relevant Files
              </>
            )}
          </Button>
          
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyArchPrompt}
            disabled={!projectDirectory}
            className="w-1/2"
            title="Generate architectural guidance to help understand and solve the task"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Guidance (AI)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          AI will analyze your task description and project to find relevant files or provide guidance.
        </p>
      </PastePaths>

      <FileBrowser
        allFilesMap={allFilesMap}
        fileContentsMap={fileContentsMap}
        onFilesMapChange={handleFilesMapChange}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        titleRegexError={titleRegexError}
        contentRegexError={contentRegexError}
        negativeTitleRegexError={negativeTitleRegexError}
        negativeContentRegexError={negativeContentRegexError}
        onTitleRegexErrorChange={setTitleRegexError || (() => {})}
        onContentRegexErrorChange={setContentRegexError || (() => {})}
        onNegativeTitleRegexErrorChange={setNegativeTitleRegexError || (() => {})}
        onNegativeContentRegexErrorChange={setNegativeContentRegexError || (() => {})}
        titleRegex={titleRegex}
        contentRegex={contentRegex}
        negativeTitleRegex={negativeTitleRegex}
        negativeContentRegex={negativeContentRegex}
        isRegexActive={isRegexActive}
        onInteraction={() => Promise.resolve(handleInteraction())}
        refreshFiles={refreshFiles || (() => Promise.resolve())}
        isLoading={isLoadingFiles || isFindingFiles}
        loadingMessage={isFindingFiles ? "Finding relevant files..." : loadingStatus}
        onAddPath={(path) => Promise.resolve(handleAddPathToPastedPaths(path))}
        showOnlySelected={showOnlySelected}
        onShowOnlySelectedChange={toggleShowOnlySelected}
        saveFileSelections={saveFileSelections}
        onToggleSelection={toggleFileSelection}
      />
    </>
  );
} 
"use client";

import React from "react";
import PastePaths from "../paste-paths";
import FileBrowser from "../file-browser";
import { FilesMap } from "../_hooks/use-generate-prompt-state";

interface FileSectionProps {
  state: {
    allFilesMap: FilesMap;
    fileContentsMap: Record<string, string>;
    searchTerm: string;
    titleRegex: string;
    contentRegex: string;
    isRegexActive: boolean;
    pastedPaths: string;
    projectDirectory: string;
    isLoadingFiles: boolean;
    loadingStatus: string;
    isFindingFiles: boolean;
    externalPathWarnings: string[];
    titleRegexError: string | null;
    contentRegexError: string | null;
    taskDescription: string;
  };
  actions: {
    handleFilesMapChange: (filesMap: FilesMap) => void;
    handleSearchChange: (value: string) => void;
    handlePastedPathsChange: (value: string) => void;
    handlePathsPreview: (paths: string[]) => void;
    handleAddPathToPastedPaths: (path: string) => void;
    handleFindRelevantFiles?: () => void;
    copyArchPrompt: () => void;
    handleInteraction: () => void;
    setTitleRegexError: (error: string | null) => void;
    setContentRegexError: (error: string | null) => void;
  };
}

export default function FileSection({ state, actions }: FileSectionProps) {
  const {
    allFilesMap,
    fileContentsMap,
    searchTerm,
    titleRegex,
    contentRegex,
    isRegexActive,
    pastedPaths,
    projectDirectory,
    isLoadingFiles,
    loadingStatus,
    isFindingFiles,
    externalPathWarnings,
    titleRegexError,
    contentRegexError,
    taskDescription
  } = state;

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
    setContentRegexError
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
      />

      <FileBrowser
        allFilesMap={allFilesMap}
        fileContentsMap={fileContentsMap}
        onFilesMapChange={handleFilesMapChange}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        titleRegexError={titleRegexError}
        contentRegexError={contentRegexError}
        onTitleRegexErrorChange={setTitleRegexError}
        onContentRegexErrorChange={setContentRegexError}
        titleRegex={titleRegex}
        contentRegex={contentRegex}
        isRegexActive={isRegexActive}
        onInteraction={handleInteraction}
        isLoading={isLoadingFiles}
        loadingMessage={loadingStatus}
        onAddPath={handleAddPathToPastedPaths}
      />
    </>
  );
} 
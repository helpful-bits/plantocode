"use client";

import React, { useEffect } from "react";
import PastePaths from "../paste-paths";
import FileBrowser from "../file-browser";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, FileCheck, Files } from "lucide-react";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const FileSection = React.memo(function FileSection() {
  // Get state and actions from contexts
  const context = useGeneratePrompt();
  const fileState = useFileManagement();
  const regexState = context.regexState;
  
  // Log state for debugging
  useEffect(() => {
    console.log("[FileSection] pastedPaths:", fileState.pastedPaths);
  }, [fileState.pastedPaths]);
  
  // Add logging for managed files map
  useEffect(() => {
    const fileCount = Object.keys(fileState.managedFilesMap).length;
    console.log(`[FileSection] managedFilesMap has ${fileCount} entries, isLoadingFiles=${fileState.isLoadingFiles}`);
    
    if (fileCount > 0) {
      const includedCount = Object.values(fileState.managedFilesMap).filter(f => f.included && !f.forceExcluded).length;
      console.log(`[FileSection] ${includedCount} of ${fileCount} files are included`);
      // Log sample entries
      const sampleKeys = Object.keys(fileState.managedFilesMap).slice(0, 3);
      console.log(`[FileSection] Sample files: ${sampleKeys.join(', ')}${fileCount > 3 ? '...' : ''}`);
    }
  }, [fileState.managedFilesMap, fileState.isLoadingFiles]);

  return (
    <>
      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="flex items-center space-x-2 border rounded-md px-3 py-1.5 bg-background">
            <div className="flex items-center gap-1.5">
              {fileState.searchSelectedFilesOnly ? (
                <FileCheck className="h-4 w-4 text-primary" />
              ) : (
                <Files className="h-4 w-4 text-muted-foreground" />
              )}
              <Label htmlFor="search-files-toggle" className="text-sm font-medium cursor-pointer">
                {fileState.searchSelectedFilesOnly ? "Selected Files Only" : "All Files"}
              </Label>
            </div>
            <Switch
              id="search-files-toggle"
              checked={fileState.searchSelectedFilesOnly}
              onCheckedChange={fileState.toggleSearchSelectedFilesOnly}
              title={fileState.searchSelectedFilesOnly ? "Search in selected files only" : "Search in all files"}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">Toggle between searching in all files or only the selected ones.</p>
        </div>
      </div>

      <PastePaths
        onChange={fileState.setPastedPaths}
        value={fileState.pastedPaths}
        projectDirectory={context.projectDirectory || ''}
        onInteraction={() => context.handleInteraction(() => fileState.getFileStateForSession())}
        onParsePaths={(paths) => {
          fileState.applySelectionsFromPaths(paths);
        }}
        warnings={fileState.externalPathWarnings}
        canCorrectPaths={!!context.projectDirectory}
        isFindingFiles={fileState.isFindingFiles}
        canFindFiles={!!context.taskState.taskDescription.trim() && !!context.projectDirectory}
        onFindRelevantFiles={fileState.findRelevantFiles}
        onGenerateGuidance={context.handleGenerateGuidance}
      >
        <div className="flex justify-between items-center gap-2 mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fileState.findRelevantFiles}
            disabled={!context.taskState.taskDescription.trim() || !context.projectDirectory || fileState.isFindingFiles}
            className="w-1/2"
            title={!context.taskState.taskDescription.trim() ? "Please enter a task description first" : 
                  !context.projectDirectory ? "Please select a project directory first" : 
                  "Find files relevant to your task using AI"}
          >
            {fileState.isFindingFiles ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Finding Files...
              </>
            ) : fileState.pastedPaths.trim() ? (
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
            onClick={context.handleGenerateGuidance}
            disabled={!context.projectDirectory}
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
        managedFilesMap={fileState.managedFilesMap}
        fileContentsMap={fileState.fileContentsMap || {}} // Use fileContentsMap from context or empty object as fallback
        searchTerm={fileState.searchTerm}
        onSearchChange={fileState.setSearchTerm}
        onToggleSelection={fileState.toggleFileSelection}
        onToggleExclusion={fileState.toggleFileExclusion}
        onBulkToggle={(shouldInclude, targetFiles) => fileState.handleBulkToggle(targetFiles, shouldInclude)}
        showOnlySelected={fileState.showOnlySelected}
        onShowOnlySelectedChange={() => fileState.setShowOnlySelected(!fileState.showOnlySelected)}
        onInteraction={() => context.handleInteraction(() => fileState.getFileStateForSession())}
        refreshFiles={async (preserveState?: boolean) => {
          await fileState.refreshFiles();
        }}
        isLoading={fileState.isLoadingFiles || fileState.isFindingFiles}
        loadingMessage={
          fileState.isFindingFiles 
            ? "Finding relevant files..." 
            : fileState.isLoadingFiles 
              ? "Loading files..." 
              : ""
        }
        onAddPath={(path) => {
          fileState.setPastedPaths(
            fileState.pastedPaths 
              ? `${fileState.pastedPaths}\n${path}` 
              : path
          );
        }}
        titleRegex={regexState.titleRegex}
        contentRegex={regexState.contentRegex}
        negativeTitleRegex={regexState.negativeTitleRegex}
        negativeContentRegex={regexState.negativeContentRegex}
        isRegexActive={regexState.isRegexActive}
      />
    </>
  );
});

export default FileSection;
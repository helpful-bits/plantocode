"use client";

import {
  Info,
  Loader2,
  FolderClosed,
  AlertCircle,
  X,
  RefreshCw,
  Files,
  Sparkles,
  Undo2,
  Redo2,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

import { useProject } from "@/contexts/project-context";
import { FilterModeToggle } from "@/ui";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { cn } from "@/utils/utils";

import FileListItem from "./_components/file-list-item";
import FindModeToggle from "./_components/find-mode-toggle";
import { useFileFiltering } from "./_hooks/file-management/use-file-filtering";
import { useFileManagement } from "./_contexts/file-management-context";

// Minimal regex state interface for compatibility
interface RegexState {
  titleRegex: string;
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
  isRegexActive: boolean;
  regexPatternGenerationError: string | null;
}


interface FileBrowserProps {
  // Regex state
  regexState: RegexState;
  taskDescription?: string;

  // Session state
  disabled?: boolean; // Added prop to disable the entire component during session switching
}

function FileBrowser({
  regexState,
  taskDescription = "",
  disabled = false,
}: FileBrowserProps) {
  const { projectDirectory } = useProject();
  const fileManagement = useFileManagement();
  
  // Destructure needed values from file management context
  const {
    managedFilesMap,
    fileContentsMap,
    searchTerm,
    setSearchTerm: onSearchChange,
    toggleFileSelection: onToggleSelection,
    toggleFileExclusion: onToggleExclusion,
    handleBulkToggle: onBulkToggle,
    filterMode,
    setFilterMode: onFilterModeChange,
    refreshFiles,
    isLoadingFiles: isLoading,
    isInitialized,
    fileLoadError,
    isFindingFiles,
    findRelevantFiles: executeFindRelevantFiles,
    findFilesMode,
    setFindFilesMode,
    canUndo,
    canRedo,
    undoSelection,
    redoSelection,
    currentWorkflowStage,
    workflowError,
  } = fileManagement;
  
  // Function to get user-friendly workflow stage message
  const getWorkflowStageMessage = useCallback((stage: string | null) => {
    if (!stage) return "Finding files...";
    
    switch (stage) {
      case 'GENERATING_DIR_TREE':
        return "Generating directory tree...";
      case 'GENERATING_REGEX':
        return "Finding initial files...";
      case 'LOCAL_FILTERING':
        return "Filtering files locally...";
      case 'INITIAL_PATH_FINDER':
        return "Finding relevant files...";
      case 'INITIAL_PATH_CORRECTION':
        return "Correcting paths...";
      case 'EXTENDED_PATH_FINDER':
        return "Finding additional files...";
      case 'EXTENDED_PATH_CORRECTION':
        return "Correcting additional paths...";
      case 'COMPLETED':
        return "Workflow completed";
      case 'FAILED':
        return "Workflow failed";
      default:
        return "Finding files...";
    }
  }, []);

  const loadingMessage = getWorkflowStageMessage(currentWorkflowStage ?? null);

  // State for copied path feedback
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Use the useFileFiltering hook
  const {
    filteredFiles,
  } = useFileFiltering({
    managedFilesMap,
    fileContentsMap,
    searchTerm,
    filterMode,
  });


  // Update the handleManualRefresh function to use the refreshFiles prop
  const handleManualRefresh = useCallback(() => {
    // Call refreshFiles if provided (real refresh)
    if (refreshFiles) {
      refreshFiles()
        .then(() => {
          // Success handling
        })
        .catch(() => {
          // Error handling with no console statements
        });
    }
  }, [refreshFiles]);

  // Sort files for display - group by directories first then alphabetically
  const displayedFiles = useMemo(() => {
    // Always return a sorted array, even if empty
    return [...filteredFiles].sort((a, b) => {
      // Get directory parts
      const aDirParts = a.path.split("/"); // Split path into parts
      const bDirParts = b.path.split("/");

      // Compare directory by directory
      const minParts = Math.min(aDirParts.length, bDirParts.length);

      for (let i = 0; i < minParts - 1; i++) {
        if (aDirParts[i] !== bDirParts[i]) {
          return aDirParts[i].localeCompare(bDirParts[i]);
        }
      }

      // If directories are the same, compare by filename
      return a.path.localeCompare(b.path);
    });
  }, [filteredFiles]);

  const includedCount = useMemo(
    () =>
      !managedFilesMap
        ? 0
        : Object.values(managedFilesMap).filter(
            (f) => f.included && !f.forceExcluded
          ).length,
    [managedFilesMap]
  );

  const totalFilesCount = useMemo(
    () => (!managedFilesMap ? 0 : Object.keys(managedFilesMap).length),
    [managedFilesMap]
  );

  const handleAddPath = useCallback(
    async (path: string, e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation(); // Prevent triggering parent click handlers

      // Set visual feedback to indicate path was copied
      setCopiedPath(path);
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        // Only reset if the current copied path is still the one we set
        setCopiedPath((currentPath) =>
          currentPath === path ? null : currentPath
        );
      }, 2000);

      // Copy path to clipboard instead
      try {
        await navigator.clipboard.writeText(path);
        // Path copied successfully (no console log)
      } catch (_error) {
        // Failed to copy path (no console error)
      }
    },
    [setCopiedPath]
  );

  return (
    <div className="space-y-4 mt-4 border border-border/60 rounded-xl p-6 bg-background/95 backdrop-blur-sm shadow-soft">
      {/* File Search Controls */}
      <div className="flex items-center gap-3 justify-between mb-4">
        <FindModeToggle
          currentMode={findFilesMode}
          onModeChange={setFindFilesMode}
          disabled={disabled || !taskDescription.trim()}
        />

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
          className="flex-1"
        >
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Find Relevant Files
          </>
        </Button>

        <div className="flex items-center gap-2">
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

      <div className="flex flex-col gap-2 mb-3">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Input
              type="search"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pr-10"
              disabled={disabled}
            />
            {searchTerm && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSearchChange("")}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Clear search"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <FilterModeToggle
            currentMode={filterMode}
            onModeChange={onFilterModeChange}
            disabled={disabled}
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isLoading || disabled}
            title="Manually refresh file list"
            className="flex gap-1.5 items-center h-9"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Removed Generate Regex button - moved to RegexAccordion.tsx */}
        <div className="flex items-center gap-2 justify-between">
          <p className="text-xs text-muted-foreground text-balance flex-1">
          </p>
        </div>
      </div>

      {/* Show error message if regex generation fails */}
      {regexState.regexPatternGenerationError && (
        <div className="text-xs text-destructive mt-1 mb-2 border border-destructive/20 bg-destructive/10 backdrop-blur-sm p-3 rounded-lg">
          {regexState.regexPatternGenerationError}
        </div>
      )}

      {/* Show workflow error message if file finder workflow fails */}
      {workflowError && (
        <div className="text-xs text-destructive mt-1 mb-2 border border-destructive/20 bg-destructive/10 backdrop-blur-sm p-3 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">File Finder Error</p>
            <p className="mt-1">{workflowError}</p>
          </div>
        </div>
      )}


      {/* Status bar with file counts */}
      {!isLoading && totalFilesCount > 0 && (
        <div className="space-y-1">
          <div
            className={`flex items-center justify-between text-sm ${includedCount === 0 ? "text-destructive" : "text-muted-foreground"} border-b pb-3`}
          >
            <div className="flex items-center gap-2">
              {includedCount === 0 && (
                <AlertCircle className="h-4 w-4 text-destructive" />
              )}
              <span
                className={`font-medium ${includedCount === 0 ? "text-destructive" : "text-foreground"}`}
              >
                {includedCount}
              </span>{" "}
              <span className={includedCount === 0 ? "text-destructive" : "text-foreground"}>
                of {totalFilesCount} files selected
              </span>
              {includedCount === 0 && (
                <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-sm">
                  No files selected
                </span>
              )}
            </div>

            <div
              className={cn(
                filteredFiles.length === totalFilesCount && "invisible"
              )}
            >
              Showing{" "}
              <span className="font-medium">{filteredFiles.length}</span> files
            </div>

            <div
              className={cn(
                "flex gap-2",
                filteredFiles.length === 0 && "invisible"
              )}
            >
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onBulkToggle(filteredFiles, false)}
                disabled={
                  disabled || filteredFiles.length === 0 || includedCount === 0
                }
                className="h-9 px-3"
              >
                Deselect Visible
              </Button>
              <Button
                type="button"
                variant={includedCount === 0 ? "destructive" : "secondary"}
                size="sm"
                onClick={() => onBulkToggle(filteredFiles, true)}
                disabled={
                  disabled ||
                  filteredFiles.length === 0 ||
                  filteredFiles.every((f) => f.included || f.forceExcluded)
                }
                className="h-9 px-3"
              >
                {includedCount === 0 ? "Select Files ↓" : "Include Filtered"}
              </Button>
            </div>
          </div>
          <div
            className={`text-xs ${includedCount === 0 ? "text-destructive font-medium" : "text-muted-foreground italic"} text-balance`}
          >
            {includedCount === 0
              ? "Select files from the list below to include them in your prompt. Files contain critical context for the AI model."
              : "Tip: Use the right checkbox to force-exclude a file (it won&apos;t be included even if selected)"}
          </div>

          {/* Extra warning when no files are selected */}
          {includedCount === 0 && (
            <div className="mt-2 p-4 border border-destructive/20 bg-destructive/10 backdrop-blur-sm rounded-lg text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">No files selected</p>
                  <p className="text-xs mt-1">
                    Selecting relevant files helps the AI understand your
                    codebase context and generate more accurate suggestions. Use
                    the &quot;Find Relevant Files&quot; button above or manually
                    select files from the list.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* File Browser Main Container */}
      <div className="border border-border/60 rounded-xl bg-background/80 backdrop-blur-sm p-4 h-[450px] overflow-auto relative shadow-soft">
        {(() => {
          // No project directory selected
          if (!projectDirectory) {
            return (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                <FolderClosed className="h-8 w-8 text-muted-foreground/80" />
                <p>Please select a project directory first</p>
              </div>
            );
          }

          // Initial loading (before any files are loaded)
          if (isLoading && !isInitialized) {
            return (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                <div className="opacity-50 transition-opacity duration-300 text-center">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p className="font-medium">Initializing file list...</p>
                  <p className="text-xs mt-2 text-muted-foreground">
                    {loadingMessage || "This may take a moment for large directories"}
                  </p>
                </div>
              </div>
            );
          }

          // Error state
          if (fileLoadError && isInitialized) {
            return (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                  <p className="font-medium text-destructive">Error loading files</p>
                  <p className="text-xs mt-2 text-destructive/80">{fileLoadError}</p>
                  <p className="text-xs mt-1 text-muted-foreground">
                    Project directory: {projectDirectory || "none"}
                  </p>
                  <div className="w-full mt-4">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleManualRefresh}
                      className="w-full h-9"
                      disabled={disabled || isLoading}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                  </div>
                </div>
              </div>
            );
          }

          // No files found in directory
          if (!isLoading && isInitialized && Object.keys(managedFilesMap).length === 0) {
            return (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
                <div className="text-center">
                  <AlertCircle className="h-8 w-8 text-warning mx-auto mb-2" />
                  <p className="font-medium text-warning">
                    No files found in the selected directory
                  </p>
                  <p className="text-xs mt-2 text-muted-foreground">
                    Project directory: {projectDirectory || "none"}
                  </p>
                  <div className="w-full mt-4">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleManualRefresh}
                      className="w-full h-9"
                      disabled={disabled}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh Files
                    </Button>
                    <p className="text-xs text-warning mt-2">
                      If files should exist in this directory, try clicking Refresh Files.
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          // Files exist but none match current filters
          if (!isLoading && Object.keys(managedFilesMap).length > 0 && displayedFiles.length === 0) {
            return (
              <div className="h-full flex items-center justify-center">
                <div className="bg-background/95 backdrop-blur-sm border border-border/60 rounded-xl p-6 max-w-md shadow-soft text-center">
                  {searchTerm ? (
                    <>
                      <Info className="h-8 w-8 text-info mx-auto mb-2" />
                      <p className="font-medium">
                        No files match your search criteria
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Try adjusting your search terms.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSearchChange("")}
                        className="mt-4 h-9"
                        disabled={disabled}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Clear Search
                      </Button>
                    </>
                  ) : filterMode === "selected" && includedCount === 0 ? (
                    <>
                      <AlertCircle className="h-8 w-8 text-warning mx-auto mb-2" />
                      <p className="font-medium text-warning">
                        No files are currently selected
                      </p>
                      <p className="text-xs mt-2 text-muted-foreground">
                        You&apos;re in &quot;Show Selected Files&quot; mode, but no
                        files are currently selected.
                      </p>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={() => onFilterModeChange("all")}
                        className="mt-4 h-9"
                        disabled={disabled}
                      >
                        <Files className="h-4 w-4 mr-2" />
                        Show All Files
                      </Button>
                    </>
                  ) : (
                    <>
                      <Info className="h-8 w-8 text-muted-foreground/80 mx-auto mb-2" />
                      <p>No files to display</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        This may be due to your current filter settings.
                      </p>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleManualRefresh}
                        className="mt-4 h-9"
                        disabled={disabled}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Files
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          }

          // Default: Render file list
          return (
            <div id="file-list-container">
              {displayedFiles.map((file) => (
                <FileListItem
                  key={`file-${file.comparablePath || file.path}`}
                  file={file}
                  onToggleSelection={onToggleSelection}
                  onToggleExclusion={onToggleExclusion}
                  onAddPath={handleAddPath}
                  copiedPath={copiedPath}
                  disabled={disabled}
                />
              ))}
            </div>
          );
        })()}

        {/* Small loading indicator for background refresh (when files are already loaded) */}
        <div
          className={`absolute top-2 right-2 bg-background/95 backdrop-blur-sm border border-border/60 rounded-lg px-3 py-2 shadow-soft flex items-center gap-2 z-10 transition-opacity duration-300 ${isLoading && isInitialized ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-xs">
            {loadingMessage || "Loading files..."}
          </p>
        </div>
      </div>
    </div>
  );
}

FileBrowser.displayName = "FileBrowser";

export default FileBrowser;
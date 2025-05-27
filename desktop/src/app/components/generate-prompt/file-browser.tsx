"use client";

import {
  Info,
  Loader2,
  FolderClosed,
  AlertCircle,
  X,
  RefreshCw,
  Files,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

import { useProject } from "@/contexts/project-context";
import { FilterModeToggle } from "@/ui";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { cn } from "@/utils/utils";

import FileListItem from "./_components/file-list-item";
import { useFileFiltering } from "./_hooks/file-management/use-file-filtering";
import { type FilesMap } from "./_hooks/file-management/use-project-file-list";

import type { FileInfo } from "@/types";

// Combined regex state interface for FileBrowser props
interface RegexState {
  titleRegex: string;
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
  isRegexActive: boolean;
  regexGenerationError: string | null;
}

// This section has been moved to actions-section.tsx

// These constants were previously used for auto-retry logic but are no longer used
// They're kept commented out for future reference
// const AUTO_RETRY_DELAY = 2000; // 2 seconds delay for auto-retry
// const MAX_AUTO_RETRIES = 3; // Maximum number of automatic retries

// This constant was previously used for localStorage but is no longer used
// const SHOW_ONLY_SELECTED_KEY = "file-browser-show-only-selected";

interface FileBrowserProps {
  managedFilesMap: FilesMap;
  fileContentsMap: { [key: string]: string };
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onToggleSelection: (path: string) => void;
  onToggleExclusion: (path: string) => void;
  onBulkToggle: (shouldInclude: boolean, targetFiles: FileInfo[]) => void;
  filterMode: "all" | "selected" | "regex";
  onFilterModeChange: (mode: "all" | "selected" | "regex") => void;
  isRegexAvailable: boolean;
  refreshFiles?: (preserveState?: boolean) => Promise<void>;
  isLoading?: boolean;
  loadingMessage?: string;

  // Initialization and error state
  isInitialized?: boolean;
  fileLoadError?: string | null;

  // Regex state
  regexState: RegexState;

  // Session state
  disabled?: boolean; // Added prop to disable the entire component during session switching
}

function FileBrowser({
  managedFilesMap,
  fileContentsMap = {},
  searchTerm,
  onSearchChange,
  onToggleSelection,
  onToggleExclusion,
  onBulkToggle,
  filterMode,
  onFilterModeChange,
  isRegexAvailable,
  refreshFiles,
  isLoading,
  loadingMessage = "",
  isInitialized = false,
  fileLoadError = null,
  regexState,
  disabled = false,
}: FileBrowserProps) {
  const { projectDirectory } = useProject();

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
    regexPatterns: {
      titleRegex: regexState.titleRegex,
      contentRegex: regexState.contentRegex,
      negativeTitleRegex: regexState.negativeTitleRegex,
      negativeContentRegex: regexState.negativeContentRegex,
    },
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
    <div className="space-y-4 mb-4 border rounded-lg p-6 bg-card shadow-sm">
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
            isRegexAvailable={isRegexAvailable}
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
            {filterMode === "regex"
              ? "Use regex patterns to filter files. Click 'Regex File Filtering' below to configure."
              : ""}
          </p>
        </div>
      </div>

      {/* Show error message if regex generation fails */}
      {regexState.regexGenerationError && (
        <div className="text-xs text-destructive mt-1 mb-2 border border-destructive/30 bg-destructive/5 p-2 rounded-md">
          {regexState.regexGenerationError}
        </div>
      )}

      {/* Find Relevant Files and Regex Accordion moved to actions-section.tsx */}

      {/* Status bar with file counts */}
      {!isLoading && totalFilesCount > 0 && (
        <div className="space-y-1">
          <div
            className={`flex items-center justify-between text-sm ${includedCount === 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"} border-b pb-3`}
          >
            <div className="flex items-center gap-2">
              {includedCount === 0 && (
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <span
                className={`font-medium ${includedCount === 0 ? "text-red-600 dark:text-red-400" : ""}`}
              >
                {includedCount}
              </span>{" "}
              of {totalFilesCount} files selected
              {includedCount === 0 && (
                <span className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-2 py-0.5 rounded-sm">
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
                onClick={() => onBulkToggle(false, filteredFiles)}
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
                onClick={() => onBulkToggle(true, filteredFiles)}
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
            className={`text-xs ${includedCount === 0 ? "text-red-500 dark:text-red-400 font-medium" : "text-muted-foreground italic"} text-balance`}
          >
            {includedCount === 0
              ? "Select files from the list below to include them in your prompt. Files contain critical context for the AI model."
              : "Tip: Use the right checkbox to force-exclude a file (it won&apos;t be included even if selected)"}
          </div>

          {/* Extra warning when no files are selected */}
          {includedCount === 0 && (
            <div className="mt-2 p-2 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 rounded-md text-sm text-red-800 dark:text-red-200">
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
      <div className="border rounded-md bg-background/50 p-3 h-[450px] overflow-auto relative">
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

          // Initial loading
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
                  <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <p className="font-medium text-red-500">Error loading files</p>
                  <p className="text-xs mt-2 text-red-400">{fileLoadError}</p>
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
                      Files may be loading in the background. If this persists, try
                      clicking Refresh Files again.
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
                <div className="bg-card border rounded-lg p-6 max-w-md shadow-md text-center">
                  {searchTerm ||
                  (regexState.isRegexActive &&
                    (regexState.titleRegex ||
                      regexState.contentRegex ||
                      regexState.negativeTitleRegex ||
                      regexState.negativeContentRegex)) ? (
                    <>
                      <Info className="h-8 w-8 text-blue-500/80 mx-auto mb-2" />
                      <p className="font-medium">
                        No files match your search criteria
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Try adjusting your search terms or regex patterns.
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

        {/* Small loading indicator for background refresh */}
        <div
          className={`absolute top-2 right-2 bg-background/95 border rounded-md px-3 py-2 shadow-sm flex items-center gap-2 z-10 transition-opacity duration-300 ${isLoading && isInitialized ? "opacity-100" : "opacity-0 pointer-events-none"}`}
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
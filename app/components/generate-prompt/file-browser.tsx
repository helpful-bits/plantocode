"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Info, Loader2, FileText, FolderClosed, AlertCircle, X, RefreshCw, Files, Sparkles, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/lib/contexts/project-context";
import { FileInfo } from "@/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import FileListItem from "./_components/file-list-item";
import RegexAccordion from "./_components/regex-accordion";
import { useFileFiltering } from "./_hooks/file-management/use-file-filtering";
import { FilesMap } from "./_hooks/file-management/use-project-file-list";
import { GeneratePromptContextValue } from "./_contexts/generate-prompt-context";

interface FindRelevantFilesSectionProps {
  onFindRelevantFiles?: () => void;
  isFindingFiles?: boolean;
  searchSelectedFilesOnly?: boolean;
  onToggleSearchSelectedFilesOnly?: (value?: boolean) => void;
  taskDescription?: string;
  includedCount: number;
  disabled?: boolean; // Add disabled prop
}

const FindRelevantFilesSection: React.FC<FindRelevantFilesSectionProps> = ({
  onFindRelevantFiles,
  isFindingFiles = false,
  searchSelectedFilesOnly = false,
  onToggleSearchSelectedFilesOnly,
  taskDescription = "",
  includedCount,
  disabled = false
}) => {
  const hasTaskDescription = !!taskDescription?.trim();

  return (
    <div className="flex flex-col gap-3 mb-4 border-b pb-4">
      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          variant={!hasTaskDescription ? "destructive" : "default"}
          size="sm"
          onClick={onFindRelevantFiles}
          disabled={isFindingFiles || !hasTaskDescription || disabled}
          className="h-9 flex items-center gap-1.5 min-w-[200px]"
          title={disabled ? "Feature disabled during session switching" :
                !hasTaskDescription
                ? "Task description required to find relevant files"
                : "Find files relevant to your task using AI"}
        >
          {isFindingFiles ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : !hasTaskDescription ? (
            <AlertCircle className="h-4 w-4 mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {!hasTaskDescription
            ? "Task Description Required"
            : `Find Relevant Files${searchSelectedFilesOnly ? (includedCount > 0 ? ` (${includedCount} Files)` : '') : ' (All Files)'}`}
        </Button>

        <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-background">
          <div className="flex items-center gap-1.5">
            {searchSelectedFilesOnly ? (
              <FileCheck className="h-4 w-4 text-primary" />
            ) : (
              <Files className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium mr-1">
              {searchSelectedFilesOnly ? "Search: Selected" : "Search: Entire Project"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleSearchSelectedFilesOnly && onToggleSearchSelectedFilesOnly()}
            className="h-6 px-2 rounded-sm"
            disabled={disabled}
            title="Toggle AI search scope between currently selected files and the entire project"
          >
            {searchSelectedFilesOnly ? "Use All Files" : "Use Selected"}
          </Button>
        </div>
      </div>

      <p className={`text-xs ${!hasTaskDescription ? 'text-red-500 dark:text-red-400 font-medium' : 'text-muted-foreground'} text-balance`}>
        {!hasTaskDescription
          ? "Please enter a task description above to enable AI file finding. This helps identify the most relevant files for your task."
          : "Use AI to find files relevant to your task description. Toggle search scope between currently selected files or the entire project."}
      </p>

      {/* Display warning when task description is empty */}
      {!hasTaskDescription && (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Fill in the task description field above to enable this feature</span>
        </div>
      )}
    </div>
  );
};

// Constants for auto-retry logic
const AUTO_RETRY_DELAY = 2000; // 2 seconds delay for auto-retry
const MAX_AUTO_RETRIES = 3; // Maximum number of automatic retries

const SHOW_ONLY_SELECTED_KEY = "file-browser-show-only-selected";

interface FileBrowserProps {
  managedFilesMap: FilesMap;
  fileContentsMap: { [key: string]: string };
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onToggleSelection: (path: string) => void;
  onToggleExclusion: (path: string) => void;
  onBulkToggle: (shouldInclude: boolean, targetFiles: FileInfo[]) => void;
  showOnlySelected: boolean;
  onShowOnlySelectedChange: () => void;
  onAddPath?: (path: string) => void;
  onInteraction?: () => void;
  refreshFiles?: (preserveState?: boolean) => Promise<void>;
  isLoading?: boolean;
  loadingMessage?: string;

  // Initialization and error state
  isInitialized?: boolean;
  fileLoadError?: string | null;

  // Find Relevant Files props
  onFindRelevantFiles?: () => void;
  isFindingFiles?: boolean;
  searchSelectedFilesOnly?: boolean;
  onToggleSearchSelectedFilesOnly?: (value?: boolean) => void;
  taskDescription?: string;

  // Regex state
  regexState: GeneratePromptContextValue['regexState'];

  // Session state
  disabled?: boolean; // Added prop to disable the entire component during session switching
}

export default function FileBrowser({
  managedFilesMap,
  fileContentsMap = {},
  searchTerm,
  onSearchChange,
  onToggleSelection,
  onToggleExclusion,
  onBulkToggle,
  showOnlySelected,
  onShowOnlySelectedChange,
  onAddPath,
  onInteraction,
  refreshFiles,
  isLoading,
  loadingMessage = "",
  isInitialized = false,
  fileLoadError = null,
  onFindRelevantFiles,
  isFindingFiles = false,
  searchSelectedFilesOnly = false,
  onToggleSearchSelectedFilesOnly,
  taskDescription = "",
  regexState,
  disabled = false
}: FileBrowserProps) {
  const { projectDirectory } = useProject();
  
  const [showPathInfo, setShowPathInfo] = useState(false);
  const lastRenderedMapRef = useRef<string | null>(null); // Track rendered file list
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  
  // Handle regex errors
  const [titleRegexError, setTitleRegexError] = useState<string | null>(null);
  const [contentRegexError, setContentRegexError] = useState<string | null>(null);
  const [negativeTitleRegexError, setNegativeTitleRegexError] = useState<string | null>(null);
  const [negativeContentRegexError, setNegativeContentRegexError] = useState<string | null>(null);
  
  // Use the useFileFiltering hook
  const { 
    filteredFiles, 
    titleRegexError: newTitleRegexError,
    contentRegexError: newContentRegexError,
    negativeTitleRegexError: newNegativeTitleRegexError,
    negativeContentRegexError: newNegativeContentRegexError
  } = useFileFiltering({
    managedFilesMap,
    fileContentsMap,
    searchTerm,
    showOnlySelected,
    regexState
  });
  
  // Update the regex errors from the hook
  useEffect(() => {
    setTitleRegexError(newTitleRegexError);
    setContentRegexError(newContentRegexError);
    setNegativeTitleRegexError(newNegativeTitleRegexError);
    setNegativeContentRegexError(newNegativeContentRegexError);
  }, [
    newTitleRegexError,
    newContentRegexError,
    newNegativeTitleRegexError,
    newNegativeContentRegexError
  ]);

  // Update the handleManualRefresh function to use the refreshFiles prop
  const handleManualRefresh = useCallback(() => {
    console.log("[FileBrowser] Manually refreshing files...");

    // Call refreshFiles if provided (real refresh)
    if (refreshFiles) {
      refreshFiles(true)
        .then(() => {
          console.log("[FileBrowser] Manual refresh completed successfully");
        })
        .catch(error => {
          console.error("[FileBrowser] Error refreshing files:", error);
        });
    } else {
      console.warn("[FileBrowser] No refreshFiles function provided");
    }

    // Also call onInteraction for compatibility with the existing code
    if (onInteraction) {
      onInteraction();
    }
  }, [refreshFiles, onInteraction]);

  // Sort files for display - group by directories first then alphabetically
  const displayedFiles = useMemo(() => {
    // Always return a sorted array, even if empty
    return [...filteredFiles].sort((a, b) => {
      // Get directory parts
      const aDirParts = a.path.split('/'); // Split path into parts
      const bDirParts = b.path.split('/');
      
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

  const includedCount = useMemo(() => 
    !managedFilesMap 
      ? 0 
      : Object.values(managedFilesMap).filter((f) => f.included && !f.forceExcluded).length,
    [managedFilesMap]
  );
  
  const totalFilesCount = useMemo(() => 
    !managedFilesMap 
      ? 0 
      : Object.keys(managedFilesMap).length,
    [managedFilesMap]
  );


  const handleAddPath = useCallback(async (path: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click handlers
    
    // Set visual feedback to indicate path was copied
    setCopiedPath(path);
    // Reset the copied state after 2 seconds
    setTimeout(() => {
      // Only reset if the current copied path is still the one we set
      setCopiedPath(currentPath => currentPath === path ? null : currentPath);
    }, 2000);
    
    // Copy path to clipboard instead
    try {
      await navigator.clipboard.writeText(path);
      console.log("[FileBrowser] Path copied to clipboard:", path);
    } catch (error) {
      console.error("[FileBrowser] Failed to copy path to clipboard:", error);
    }
  }, []);

  // Handle bulk toggle for filtered files
  const handleBulkToggle = useCallback((shouldInclude: boolean) => {
    onBulkToggle(shouldInclude, filteredFiles);
  }, [filteredFiles, onBulkToggle]);

  return (
    <div className="space-y-4 mb-4 border rounded-lg p-6 bg-card shadow-sm">
      
      <div className="flex items-center gap-4 mb-3">
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

        <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-background">
          <div className="flex items-center gap-1.5">
            {showOnlySelected ? (
              <Files className="h-4 w-4 text-primary" />
            ) : (
              <Files className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium mr-1">
              {showOnlySelected ? "Selected Files" : "All Files"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => typeof onShowOnlySelectedChange === 'function' && onShowOnlySelectedChange()}
            className="h-6 px-2 rounded-sm"
            disabled={disabled}
            title={showOnlySelected ? "Show all files" : "Show selected files only"}
          >
            {showOnlySelected ? "Show All" : "Show Selected"}
          </Button>
        </div>
        
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
      
      <div className="text-xs text-muted-foreground mt-1 text-balance">
        Search files by path name. Toggle between showing all project files or only selected files.
      </div>
      
      {/* Find Relevant Files UI Section */}
      <FindRelevantFilesSection
        onFindRelevantFiles={onFindRelevantFiles}
        isFindingFiles={isFindingFiles}
        searchSelectedFilesOnly={searchSelectedFilesOnly}
        onToggleSearchSelectedFilesOnly={onToggleSearchSelectedFilesOnly}
        taskDescription={taskDescription}
        includedCount={includedCount}
        disabled={disabled}
      />

      {/* Regex Accordion */}
      <RegexAccordion
        regexState={regexState}
        onInteraction={onInteraction || (() => {})}
        taskDescription={taskDescription}
        titleRegexError={titleRegexError}
        contentRegexError={contentRegexError}
        negativeTitleRegexError={negativeTitleRegexError}
        negativeContentRegexError={negativeContentRegexError}
        disabled={disabled}
      />

      {/* Status bar with file counts */}
      {!isLoading && totalFilesCount > 0 && (
        <div className="space-y-1">
          <div className={`flex items-center justify-between text-sm ${includedCount === 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'} border-b pb-3`}>
            <div className="flex items-center gap-2">
              {includedCount === 0 && <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />}
              <span className={`font-medium ${includedCount === 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{includedCount}</span> of {totalFilesCount} files selected
              {includedCount === 0 && (
                <span className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-2 py-0.5 rounded-sm">
                  No files selected
                </span>
              )}
            </div>

            {displayedFiles.length !== totalFilesCount && (
              <div>
                Showing <span className="font-medium">{displayedFiles.length}</span> files
              </div>
            )}

            {filteredFiles.length > 0 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onBulkToggle(false, filteredFiles)}
                  disabled={disabled || filteredFiles.length === 0 || includedCount === 0}
                  className="h-9 px-3"
                >
                  Deselect Visible
                </Button>
                <Button
                  type="button"
                  variant={includedCount === 0 ? "destructive" : "secondary"}
                  size="sm"
                  onClick={() => onBulkToggle(true, filteredFiles)}
                  disabled={disabled || filteredFiles.length === 0 || filteredFiles.every(f => f.included || f.forceExcluded)}
                  className="h-9 px-3"
                >
                  {includedCount === 0 ? "Select Files ↓" : "Include Filtered"}
                </Button>
              </div>
            )}
          </div>
          <div className={`text-xs ${includedCount === 0 ? 'text-red-500 dark:text-red-400 font-medium' : 'text-muted-foreground italic'} text-balance`}>
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
                  <p className="text-xs mt-1">Selecting relevant files helps the AI understand your codebase context and generate more accurate suggestions. Use the &quot;Find Relevant Files&quot; button above or manually select files from the list.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* File Browser Main Container */}
      <div className="border rounded-md bg-background/50 p-3 h-[450px] overflow-auto relative">
        {/* Loading indicator overlay */}
        <div className={`absolute top-2 right-2 bg-background/95 border rounded-md px-3 py-2 shadow-sm flex items-center gap-2 z-10 transition-opacity duration-300 ${isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-xs">{loadingMessage || "Loading files..."}</p>
        </div>

        {/* No project directory selected */}
        {!projectDirectory && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
            <FolderClosed className="h-8 w-8 text-muted-foreground/80" />
            <p>Please select a project directory first</p>
          </div>
        )}

        {/* Loading state - files list not yet initialized */}
        {projectDirectory && !isInitialized && isLoading && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
            <div className="opacity-50 transition-opacity duration-300 text-center">
              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
              <p className="font-medium">Initializing file list...</p>
              <p className="text-xs mt-2 text-muted-foreground">{loadingMessage || "This may take a moment for large directories"}</p>
            </div>
          </div>
        )}

        {/* Error loading files */}
        {projectDirectory && isInitialized && fileLoadError && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="font-medium text-red-500">Error loading files</p>
              <p className="text-xs mt-2 text-red-400">{fileLoadError}</p>
              <p className="text-xs mt-1 text-muted-foreground">Project directory: {projectDirectory || "none"}</p>

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
        )}

        {/* No files found in directory - initialized but empty */}
        {projectDirectory && isInitialized && !fileLoadError && !isLoading && Object.keys(managedFilesMap).length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <p className="font-medium text-amber-500">No files found in the selected directory</p>
              <p className="text-xs mt-2 text-muted-foreground">Project directory: {projectDirectory || "none"}</p>

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

                <p className="text-xs text-amber-500 mt-2">
                  Files may be loading in the background. If this persists, try clicking Refresh Files again.
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Files in directory but nothing to display due to filters */}
        {!isLoading && Object.keys(managedFilesMap).length > 0 && displayedFiles.length === 0 && (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-background/90 backdrop-blur-[1px] z-10">
            <div className="bg-card border rounded-lg p-6 max-w-md shadow-md text-center">
              {searchTerm || (regexState.isRegexActive && (regexState.titleRegex || regexState.contentRegex || regexState.negativeTitleRegex || regexState.negativeContentRegex)) ? (
                <>
                  <Info className="h-8 w-8 text-blue-500/80 mx-auto mb-2" />
                  <p className="font-medium">No files match your search criteria</p>
                  <p className="text-xs text-muted-foreground mt-2">Try adjusting your search terms or regex patterns.</p>
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
              ) : showOnlySelected && includedCount === 0 ? (
                <>
                  <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <p className="font-medium text-amber-500">No files are currently selected</p>
                  <p className="text-xs mt-2 text-muted-foreground">You&apos;re in &quot;Show Selected Files&quot; mode, but no files are currently selected.</p>
                  
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => typeof onShowOnlySelectedChange === 'function' && onShowOnlySelectedChange()}
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
                  <p className="text-xs text-muted-foreground mt-2">This may be due to your current filter settings.</p>
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
        )}

        {/* ALWAYS render file list container */}
        <div id="file-list-container">
          {/* Only render files when we have files to display */}
          {Object.keys(managedFilesMap).length > 0 && 
            // Map all available files
            Object.values(managedFilesMap).map((file) => (
              <FileListItem
                key={`file-${file.comparablePath || file.path}`}
                file={file}
                onToggleSelection={onToggleSelection}
                onToggleExclusion={onToggleExclusion}
                onAddPath={handleAddPath}
                copiedPath={copiedPath}
                disabled={disabled}
              />
            ))
          }
        </div>
      </div>
    </div>
  );
}
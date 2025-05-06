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
  
  // Find Relevant Files props
  onFindRelevantFiles?: () => void;
  isFindingFiles?: boolean;
  searchSelectedFilesOnly?: boolean;
  onToggleSearchSelectedFilesOnly?: (value?: boolean) => void;
  taskDescription?: string;
  
  // Regex state
  regexState: GeneratePromptContextValue['regexState'];
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
  onFindRelevantFiles,
  isFindingFiles = false,
  searchSelectedFilesOnly = false,
  onToggleSearchSelectedFilesOnly,
  taskDescription = "",
  regexState
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
    // Call refreshFiles if provided (real refresh)
    if (refreshFiles) {
      refreshFiles(true).catch(error => {
        console.error("[FileBrowser] Error refreshing files:", error);
      });
    }
    
    // Also call onInteraction for compatibility with the existing code
    if (onInteraction) {
      onInteraction();
    }
  }, [refreshFiles, onInteraction]);

  // Sort files for display - group by directories first then alphabetically
  const displayedFiles = useMemo(() => {
    // Only skip if no files to display
    if (filteredFiles.length === 0) return [];
    
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


  // Handle adding path to selection textarea
  const handleAddPath = useCallback(async (path: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click handlers
    
    // Call the callback if provided
    if (onAddPath) {
      onAddPath(path);
      
      // Set visual feedback
      setCopiedPath(path);
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        // Only reset if the current copied path is still the one we set
        setCopiedPath(currentPath => currentPath === path ? null : currentPath);
      }, 2000);
    }
  }, [onAddPath]);

  // Handle bulk toggle for filtered files
  const handleBulkToggle = useCallback((shouldInclude: boolean) => {
    onBulkToggle(shouldInclude, filteredFiles);
  }, [filteredFiles, onBulkToggle]);

  return (
    // Use key to force re-render when projectDirectory changes, ensuring cache state is reset
    <div className="space-y-4 mb-4 border rounded-lg p-4 bg-card shadow-sm">
      
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1"> {/* Added relative positioning */}
          <Input
            type="search" // Use search type for better semantics and potential browser clear button
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full" // Ensure input takes full width
          />
          {searchTerm && ( // Show clear button only if search term exists
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSearchChange("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground" // Position clear button inside input
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Filter the file list by path.</p>

        <div className="flex items-center space-x-2 border rounded-md px-3 py-1.5 bg-background">
          <div className="flex items-center gap-1.5">
            {showOnlySelected ? (
              <Files className="h-4 w-4 text-primary" />
            ) : (
              <Files className="h-4 w-4 text-muted-foreground" />
            )}
            <Label htmlFor="show-selected-toggle" className="text-sm font-medium cursor-pointer">
              {showOnlySelected ? "Selected Files" : "All Files"}
            </Label>
          </div>
          <Switch
            id="show-selected-toggle"
            checked={showOnlySelected}
            onCheckedChange={onShowOnlySelectedChange}
            title={showOnlySelected ? "Show selected files only" : "Show all files"}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Toggle between viewing all project files or only the ones currently selected for inclusion.</p>
        
        {/* Keep manual refresh button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isLoading}
          title="Manually refresh file list"
          className="flex gap-1.5 items-center"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Find Relevant Files UI Section */}
      <div className="flex items-center gap-4 mb-4 border-b pb-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onFindRelevantFiles}
            disabled={isFindingFiles || !taskDescription || !taskDescription.trim()}
            className="h-9 flex items-center gap-1.5"
            title="Find files relevant to your task using AI"
          >
            {isFindingFiles ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Find Relevant Files
          </Button>
        </div>
        
        <div className="flex items-center space-x-2 border rounded-md px-3 py-1.5 bg-background">
          <div className="flex items-center gap-1.5">
            {searchSelectedFilesOnly ? (
              <FileCheck className="h-4 w-4 text-primary" />
            ) : (
              <Files className="h-4 w-4 text-muted-foreground" />
            )}
            <Label htmlFor="ai-search-scope-toggle" className="text-sm font-medium cursor-pointer">
              {searchSelectedFilesOnly ? "Search: Selected" : "Search: Entire Project"}
            </Label>
          </div>
          <Switch
            id="ai-search-scope-toggle"
            checked={searchSelectedFilesOnly}
            onCheckedChange={onToggleSearchSelectedFilesOnly}
            title="Toggle AI search scope between currently selected files and the entire project"
          />
        </div>
        
        <p className="text-xs text-muted-foreground">AI will suggest files based on your task description.</p>
      </div>

      {/* Regex Accordion */}
      <RegexAccordion
        regexState={regexState}
        onInteraction={onInteraction || (() => {})}
        taskDescription={taskDescription}
        titleRegexError={titleRegexError}
        contentRegexError={contentRegexError}
        negativeTitleRegexError={negativeTitleRegexError}
        negativeContentRegexError={negativeContentRegexError}
      />

      {/* Status bar with file counts */}
      {!isLoading && totalFilesCount > 0 && ( // Use totalFilesCount for check
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-2">
            <div>
              <span className="font-medium">{includedCount}</span> of {totalFilesCount} files selected
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
                  variant="secondary" size="sm"
                  onClick={() => handleBulkToggle(false)}
                  disabled={filteredFiles.length === 0 || includedCount === 0}
                  className="h-9" // Keep existing style
                > {/* Close Button */}
                  Deselect Visible
                </Button>
                <Button
                  type="button"
                  variant="secondary" size="sm"
                  onClick={() => handleBulkToggle(true)}
                  disabled={filteredFiles.length === 0 || filteredFiles.every(f => f.included || f.forceExcluded)}
                  className="h-9" // Keep existing style
                > {/* Close Button */}
                  Include Filtered
                </Button>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground italic">
            Tip: Click the second checkbox to force exclude a file (it cannot be included when force excluded)
          </div>
        </div>
      )}

      {/* File list display */}
      <div className="border rounded bg-background/50 p-2 h-[450px] overflow-auto relative">
        {/* Loading overlay that appears on top of the file list */}
        {isLoading && (
          <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center gap-3 text-muted-foreground z-10">
            <Loader2 className="h-8 w-8 animate-spin" />
            <div className="text-center">
              <p className="font-medium">Loading files...</p>
              {loadingMessage && <p className="text-sm">{loadingMessage}</p>}
            </div>
          </div>
        )}
        
        
        {/* Empty state message */}
        {displayedFiles.length === 0 && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
            {!projectDirectory ? (
              <>
                <FolderClosed className="h-8 w-8" />
                <p>Please select a project directory first</p>
              </>
            ) : searchTerm || (regexState.isRegexActive && (regexState.titleRegex || regexState.contentRegex || regexState.negativeTitleRegex || regexState.negativeContentRegex)) ? (
              <>
                <Info className="h-8 w-8" />
                <p>No files match your search criteria</p>
              </>
            ) : totalFilesCount === 0 ? (
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                <p className="font-medium text-amber-500">No files found in the selected directory</p>
                <p className="text-xs mt-2 text-muted-foreground">Project directory: {projectDirectory || "none"}</p>
                
                <Button 
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleManualRefresh}
                  className="w-full mt-4"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Files
                </Button>
              </div>
            ) : (
              <>
                <Info className="h-8 w-8" />
                <p>No files to display</p>
                <p className="text-xs text-muted-foreground">This is an unexpected state. Please try refreshing.</p>
              </>
            )}
          </div>
        )}
        
        {/* File list */}
        {displayedFiles.length > 0 && (
          <>
            {displayedFiles.map((file) => (
              <FileListItem
                key={`file-${file.path}-${file.included ? 1 : 0}-${file.forceExcluded ? 1 : 0}`}
                file={file}
                onToggleSelection={onToggleSelection}
                onToggleExclusion={onToggleExclusion}
                onAddPath={handleAddPath}
                copiedPath={copiedPath}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
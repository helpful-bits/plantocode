"use client";

import { RefreshCw, X, AlertCircle, Loader2, Search, Undo, Redo, CheckSquare, Square, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import React from "react";
import { useProject } from "@/contexts/project-context";
import { useSessionStateContext } from "@/contexts/session";
import { Button } from "@/ui/button";
import { FilterModeToggle } from "@/ui/filter-mode-toggle";
import { useFileSelection } from "./_hooks/use-file-selection";
import { FileItem } from "./_components/file-item";

export interface FileBrowserHandle {
  handleApplyFilesFromJob: (paths: string[], source: string) => void;
}

/**
 * EXTREMELY SIMPLE file browser
 * No complex state management, no caching, no multiple contexts
 * Just a list of files with checkboxes
 */
export const FileBrowser = React.forwardRef<FileBrowserHandle, {}>((_, ref) => {
  const { projectDirectory } = useProject();
  const { currentSession } = useSessionStateContext();
  const {
    files,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    filterMode,
    setFilterMode,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    toggleFileSelection,
    toggleFileExclusion,
    refreshFiles,
    includedCount,
    totalCount,
    undo,
    redo,
    canUndo,
    canRedo,
    triggerFind,
    findingFiles,
    findingFilesError,
    selectFiltered,
    deselectFiltered,
    applyWorkflowResultsToSession,
    cancelFind,
  } = useFileSelection(projectDirectory);

  const handleApplyFilesFromJob = React.useCallback((paths: string[], source: string) => {
    applyWorkflowResultsToSession(paths, source);
  }, [applyWorkflowResultsToSession]);

  React.useImperativeHandle(ref, () => ({
    handleApplyFilesFromJob,
  }), [handleApplyFilesFromJob]);

  if (!projectDirectory) {
    return (
      <div className="space-y-4 mt-4 border border-border/60 rounded-xl p-6 bg-background/95">
        <div className="text-center text-muted-foreground">
          Please select a project directory first
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4 border border-border/60 rounded-xl p-6 bg-background/95">
      {/* Search and Filter Controls - Row 1 */}
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2 border border-border/50 rounded-lg bg-background/80 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {searchTerm && (
            <>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {files.length} result{files.length !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="flex-shrink-0 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
        
        {/* Filter Mode Toggle with counts */}
        <FilterModeToggle
          currentMode={filterMode}
          onModeChange={setFilterMode}
          includedCount={includedCount}
          totalCount={totalCount}
        />
      </div>

      {/* Action Controls - Row 2 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Select/Deselect All */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={selectFiltered}
              disabled={files.length === 0}
              title="Select all filtered/visible files"
            >
              <CheckSquare className="h-4 w-4 mr-1" />
              Select
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={deselectFiltered}
              disabled={files.filter(f => f.included).length === 0}
              title="Deselect all filtered/visible files"
            >
              <Square className="h-4 w-4 mr-1" />
              Deselect
            </Button>
          </div>
          
          {/* Undo/Redo buttons */}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={undo}
              disabled={!canUndo}
              title="Undo file selection"
            >
              <Undo className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={redo}
              disabled={!canRedo}
              title="Redo file selection"
            >
              <Redo className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <Button
            variant="outline"
            size="sm"
            onClick={refreshFiles}
            disabled={loading}
            title="Refresh file list"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* AI Find Button - Full width like original */}
      <div className="flex items-center gap-2">
        <Button
          variant={findingFilesError ? "destructive" : "default"}
          size="sm"
          onClick={triggerFind}
          disabled={!currentSession?.taskDescription?.trim() || findingFiles}
          className={`w-full ${
            findingFilesError
              ? "bg-destructive/90 hover:bg-destructive border-destructive"
              : ""
          }`}
          title={
            !currentSession?.taskDescription?.trim()
              ? "Enter a task description first"
              : findingFiles
              ? "Finding files..."
              : findingFilesError
              ? `Error: ${findingFilesError} - Click to retry`
              : "Find relevant files using AI analysis"
          }
        >
          {findingFiles ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : findingFilesError ? (
            <RefreshCw className="h-4 w-4 mr-2" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {findingFiles
            ? "Finding Files..."
            : findingFilesError
            ? "Retry File Search"
            : "Find Relevant Files with AI"}
        </Button>
        {findingFiles && (
          <Button
            variant="outline"
            size="sm"
            onClick={cancelFind}
          >
            Cancel
          </Button>
        )}
      </div>


      {/* File table with sticky header */}
      <div className="border border-border/60 rounded-xl bg-background/80 h-[450px] overflow-hidden flex flex-col">
        {/* Table Header - Sticky */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-border/40 bg-muted/30">
          <div className="flex items-center gap-2">
            {/* Select/Exclude columns */}
            <div className="w-16 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <span>Inc</span>
              <span>Exc</span>
            </div>
            
            {/* File Name column */}
            <div className="flex-1 min-w-0">
              <button
                className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
                onClick={() => {
                  if (sortBy === "name") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("name");
                    setSortOrder("asc");
                  }
                }}
              >
                File Name
                {sortBy === "name" && (
                  sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                )}
              </button>
            </div>
            
            {/* Size column */}
            <div className="w-20 flex justify-end">
              <button
                className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
                onClick={() => {
                  if (sortBy === "size") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("size");
                    setSortOrder("desc"); // Default to largest first for file sizes
                  }
                }}
              >
                Size
                {sortBy === "size" && (
                  sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                )}
              </button>
            </div>
            
            {/* Modified column */}
            <div className="w-28 flex justify-end">
              <button
                className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
                onClick={() => {
                  if (sortBy === "modified") {
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                  } else {
                    setSortBy("modified");
                    setSortOrder("desc"); // Default to newest first for timestamps
                  }
                }}
              >
                Modified
                {sortBy === "modified" && (
                  sortOrder === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                )}
              </button>
            </div>
            
            {/* Actions column */}
            <div className="w-10"></div>
          </div>
        </div>

        {/* Table Body - Scrollable */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                <p>Loading files...</p>
              </div>
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-destructive">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>Error: {error}</p>
                <Button variant="outline" size="sm" onClick={refreshFiles} className="mt-2">
                  Try Again
                </Button>
              </div>
            </div>
          ) : files.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                No files found
              </div>
            </div>
          ) : (
            <div className="p-2">
              {files.map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  onToggleSelection={toggleFileSelection}
                  onToggleExclusion={toggleFileExclusion}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

FileBrowser.displayName = "FileBrowser";
"use client";

import { RefreshCw, X, AlertCircle, Loader2, Search, Undo, Redo, CheckSquare, Square, Sparkles } from "lucide-react";
import { useProject } from "@/contexts/project-context";
import { useSessionStateContext } from "@/contexts/session";
import { Button } from "@/ui/button";
import { FilterModeToggle } from "@/ui/filter-mode-toggle";
import { useSimpleFileSelection } from "./_hooks/use-simple-file-selection";
import { SimpleFileItem } from "./_components/simple-file-item";

/**
 * EXTREMELY SIMPLE file browser
 * No complex state management, no caching, no multiple contexts
 * Just a list of files with checkboxes
 */
export function SimpleFileBrowser() {
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
    selectFiltered,
    deselectFiltered,
  } = useSimpleFileSelection(projectDirectory);

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
      <div className="flex">
        <Button
          variant="default"
          size="sm"
          onClick={triggerFind}
          disabled={!currentSession?.taskDescription?.trim() || findingFiles}
          className="w-full"
          title={
            !currentSession?.taskDescription?.trim()
              ? "Enter a task description first"
              : findingFiles
              ? "Finding files..."
              : "Find relevant files using AI analysis"
          }
        >
          {findingFiles ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          {findingFiles ? "Finding Files..." : "Find Relevant Files with AI"}
        </Button>
      </div>


      {/* File list */}
      <div className="border border-border/60 rounded-xl bg-background/80 p-4 h-[450px] overflow-auto">
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
          <div className="space-y-1">
            {files.map((file) => (
              <SimpleFileItem
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
  );
}
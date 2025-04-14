"use client";

import { Dispatch, SetStateAction, useState, useEffect, useMemo, useCallback } from "react";
import { Info, ToggleLeft, ToggleRight, Loader2, FileText, FolderClosed, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/lib/contexts/project-context";
import { useDatabase } from "@/lib/contexts/database-context";
import { useFormat } from "@/lib/contexts/format-context";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatPathForDisplay } from "@/lib/path-utils";
import { FileInfo } from "@/types";

type FilesMap = { [path: string]: FileInfo };

interface FileBrowserProps {
  allFilesMap?: FilesMap;
  fileContentsMap?: { [key: string]: string }; // Add file contents map
  onFilesMapChange?: (newMap: FilesMap) => void;
  searchTerm?: string;
  onSearchChange?: (value: string) => void;
  titleRegex: string;
  contentRegex: string;
  isRegexActive: boolean;
  titleRegexError: string | null; // Add error state props
  contentRegexError: string | null;
  onTitleRegexErrorChange: (error: string | null) => void; // Add error handler props
  onContentRegexErrorChange: (error: string | null) => void;
  onInteraction?: () => void;
  debugMode?: boolean;
  isLoading?: boolean;
  // Legacy prop names
  files?: FilesMap;
  onFilesChange?: (newMap: FilesMap) => void;
  searchFilter?: string;
  loadingMessage?: string;
}

const SHOW_ONLY_SELECTED_KEY = "file-browser-show-only-selected";

export default function FileBrowser({
  allFilesMap: propsAllFilesMap,
  fileContentsMap = {}, // Default to empty object
  files: propsFiles,
  onFilesMapChange,
  onFilesChange,
  searchTerm: propSearchTerm,
  searchFilter,
  onSearchChange = () => {},
  titleRegexError,
  contentRegexError,
  onTitleRegexErrorChange,
  onContentRegexErrorChange,
  titleRegex,
  contentRegex,
  isRegexActive,
  onInteraction,
  isLoading,
  loadingStatus,
  loadingMessage
}: FileBrowserProps) {
  // Normalize props to use both naming conventions
  const allFilesMap = propsAllFilesMap || propsFiles || {};
  const searchTerm = propSearchTerm || searchFilter || "";

  const { projectDirectory } = useProject();
  const { repository } = useDatabase();
  const { outputFormat } = useFormat();
  const [showOnlySelected, setShowOnlySelected] = useState<boolean>(false);
  const [showPathInfo, setShowPathInfo] = useState(false);
  const [isPreferenceLoading, setIsPreferenceLoading] = useState(true);

  const handleSearchChangeInternal = (value: string) => {
    onSearchChange(value);
    if (onInteraction) onInteraction();
  };

  const handleFilesMapChangeInternal = (newMap: FilesMap) => {
    if (onFilesMapChange) {
      onFilesMapChange(newMap);
    }
    if (onFilesChange) {
      onFilesChange(newMap);
    }
    if (onInteraction) {
      onInteraction();
    }
  };

  useEffect(() => {
    setIsPreferenceLoading(true);
    const loadPreference = async () => {
      if (repository && projectDirectory && outputFormat) {
        try {
          const savedPreference = await repository.getCachedState(
            projectDirectory,
            outputFormat,
            SHOW_ONLY_SELECTED_KEY
          );
          setShowOnlySelected(savedPreference === "true");
        } catch (e) {
          console.error("Failed to load 'showOnlySelected' preference:", e);
        } finally {
          setIsPreferenceLoading(false);
        }
      } else {
        setIsPreferenceLoading(false);
      }
    };

    loadPreference();
  }, [projectDirectory, repository, outputFormat]);

  const toggleShowOnlySelected = async () => {
    const newValue = !showOnlySelected;
    setShowOnlySelected(newValue);

    if (projectDirectory && repository) {
      try {
        await repository.saveCachedState(
          projectDirectory,
          outputFormat,
          SHOW_ONLY_SELECTED_KEY,
          String(newValue)
        );
      } catch (error) {
        console.error("Failed to save 'showOnlySelected' preference:", error);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleToggleFile = (path: string) => {
    const newMap = { ...allFilesMap };
    if (newMap[path]) {
      newMap[path] = { ...newMap[path], included: !newMap[path].included };
      if (newMap[path].included) {
        newMap[path].forceExcluded = false;
      }
    }
    handleFilesMapChangeInternal(newMap);
  };

  const handleToggleForceExclude = (path: string) => {
    const newMap = { ...allFilesMap };
    if (newMap[path]) {
      const currentFile = newMap[path];
      const forceExcluded = !currentFile.forceExcluded;
      newMap[path] = {
        ...currentFile,
        forceExcluded,
        included: forceExcluded ? false : currentFile.included,
      };
    }
    handleFilesMapChangeInternal(newMap);
  };

  const handleBulkToggle = useCallback((include: boolean, filesToToggle: FileInfo[]) => {
    const newMap = { ...allFilesMap };
    filesToToggle.forEach(file => {
      const currentFile = newMap[file.path];
      if (currentFile) {
        currentFile.included = include ? !currentFile.forceExcluded : false;
        if (include && currentFile.forceExcluded) {
          currentFile.forceExcluded = false;
        }
      }
    });

    handleFilesMapChangeInternal(newMap);
  }, [allFilesMap, handleFilesMapChangeInternal]);

  // Filter files based on search and showOnlySelected
  const filteredDisplayFiles = useMemo(() => {
    if (!allFilesMap) return []; // Guard against null/undefined map
    let filesToFilter = Object.values(allFilesMap);
    let filteredFiles: FileInfo[] = [];

    // --- 1. Filter by Search Term ---
    const lowerSearchTerm = searchTerm.toLowerCase();
    if (lowerSearchTerm) {
      filesToFilter = filesToFilter.filter(file =>
        file.path.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // --- 2. Filter by Regex (if active) ---
    let currentTitleError: string | null = null;
    let currentContentError: string | null = null;
    const matchedPathsByRegex = new Set<string>();

    if (isRegexActive) {
      const titleRegexTrimmed = titleRegex.trim();
      const contentRegexTrimmed = contentRegex.trim();
      const hasTitleRegex = !!titleRegexTrimmed;
      const hasContentRegex = !!contentRegexTrimmed;
      const hasFileContents = Object.keys(fileContentsMap).length > 0;

      if (hasTitleRegex || hasContentRegex) {
        // Apply title regex
        if (hasTitleRegex) {
          try {
            const regex = new RegExp(titleRegexTrimmed);
            filesToFilter.forEach(file => {
              if (regex.test(file.path)) {
                matchedPathsByRegex.add(file.path); // Add matches from title regex
              }
            });
            currentTitleError = null; // Clear error if regex is valid
          } catch (e) {
            currentTitleError = e instanceof Error ? e.message : "Invalid title regex";
            console.error("Title Regex Error:", e);
          }
        }

        // Apply content regex
        if (hasContentRegex && hasFileContents) {
          try {
            const regex = new RegExp(contentRegexTrimmed, 'm'); // Multiline match
            filesToFilter.forEach(file => {
              const content = fileContentsMap[file.path];
              if (typeof content === 'string' && regex.test(content)) {
                matchedPathsByRegex.add(file.path); // Add matches from content regex
              }
            });
            currentContentError = null; // Clear error if regex is valid
          } catch (e) {
            currentContentError = e instanceof Error ? e.message : "Invalid content regex";
            console.error("Content Regex Error:", e);
          }
        }

        // Filter based on the combined matches from *either* title or content regex
        if (hasTitleRegex || hasContentRegex) {
          filteredFiles = filesToFilter.filter(file => matchedPathsByRegex.has(file.path));
        } else {
          // If regex is active but neither pattern is valid or provided, return the search-filtered list
          filteredFiles = filesToFilter;
        }
      } else {
        // Regex is active, but no patterns provided
        filteredFiles = filesToFilter;
      }
    } else {
      // Regex is inactive, just use the search-filtered list
      filteredFiles = filesToFilter;
    }

    // Set errors outside the main filtering logic if they changed
    if (currentTitleError !== titleRegexError) onTitleRegexErrorChange(currentTitleError);
    if (currentContentError !== contentRegexError) onContentRegexErrorChange(currentContentError);

    // --- 3. Filter by "Show Only Selected" ---
    if (showOnlySelected) {
      filteredFiles = filteredFiles.filter(file => file.included && !file.forceExcluded);
    }

    return filteredFiles;

  }, [allFilesMap, searchTerm, showOnlySelected, isRegexActive, titleRegex, contentRegex, fileContentsMap, titleRegexError, contentRegexError, onTitleRegexErrorChange, onContentRegexErrorChange]);

  // Sort files for display - group by directories first then alphabetically
  const displayedFiles = useMemo(() => {
    return filteredDisplayFiles.sort((a, b) => {
      // Get directory parts
      const aDirParts = a.path.split('/');
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
  }, [filteredDisplayFiles]);

  const includedCount = useMemo(() => 
    allFilesMap 
      ? Object.values(allFilesMap).filter((f) => f.included && !f.forceExcluded).length 
      : 0, 
    [allFilesMap]
  );
  
  const totalFilesCount = useMemo(() => 
    allFilesMap ? Object.keys(allFilesMap).length : 0, 
    [allFilesMap]
  );

  // Log the allFilesMap for debugging
  useEffect(() => {
    console.log(`FileBrowser: Total files count = ${totalFilesCount}, Files Map:`, allFilesMap);
  }, [allFilesMap, totalFilesCount]);

  const getDisplayPath = useCallback((filePath: string): string => {
    return formatPathForDisplay(filePath);
  }, []);

  return (
    <div className="space-y-4 mb-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => handleSearchChangeInternal(e.target.value)}
            className="w-full"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleShowOnlySelected}
          className={cn(
            "flex gap-1.5 items-center whitespace-nowrap",
            showOnlySelected && "bg-accent"
          )}
          title={showOnlySelected ? "Show all files" : "Show only selected files"}
        >
          {showOnlySelected ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {showOnlySelected ? "Selected" : "All Files"}
        </Button>
      </div>

      {/* Status bar with file counts */}
      {!isLoading && allFilesMap && Object.keys(allFilesMap).length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground border-b pb-2">
          <div>
            <span className="font-medium">{includedCount}</span> of {totalFilesCount} files selected
          </div>
          
          {displayedFiles.length !== totalFilesCount && (
            <div>
              Showing <span className="font-medium">{displayedFiles.length}</span> files
            </div>
          )}
          
          {filteredDisplayFiles.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary" size="sm"
                onClick={() => handleBulkToggle(false, filteredDisplayFiles)}
                disabled={filteredDisplayFiles.length === 0 || includedCount === 0}
                className="h-9"
              >
                Deselect Visible
              </Button>
              <Button
                type="button"
                variant="secondary" size="sm"
                onClick={() => handleBulkToggle(true, filteredDisplayFiles)}
                disabled={filteredDisplayFiles.length === 0 || filteredDisplayFiles.every(f => f.included || f.forceExcluded)}
                className="h-9"
              >
                Include Filtered
              </Button>
            </div>
          )}
        </div>
      )}

      {/* File list display */}
      {isLoading ? (
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <div>
            <p className="font-medium">Loading files from git repository...</p>
            {loadingMessage && <p className="text-sm">{loadingMessage}</p>}
          </div>
        </div>
      ) : displayedFiles.length > 0 ? (
        <ScrollArea className="border rounded bg-background/50 p-2 h-[450px]">
          {displayedFiles.map((file) => {
            // Extract directory part for grouping
            const pathParts = file.path.split('/');
            const fileName = pathParts.pop() || '';
            const dirPath = pathParts.join('/');
            
            return (
              <div
                key={file.path}
                className={cn(
                  "flex items-center justify-between gap-2 text-sm py-1.5 hover:bg-accent/50 rounded px-2",
                  file.included && !file.forceExcluded ? "bg-accent/70" : "",
                  file.forceExcluded ? "opacity-60" : ""
                )}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={file.included}
                    onChange={() => handleToggleFile(file.path)}
                    disabled={file.forceExcluded}
                    className="cursor-pointer flex-shrink-0"
                  />
                  <input
                    type="checkbox"
                    checked={file.forceExcluded}
                    onChange={() => handleToggleForceExclude(file.path)}
                    className={cn("cursor-pointer accent-destructive flex-shrink-0 w-3.5 h-3.5")}
                    title="Force Exclude (cannot be included)"
                  />
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span
                    className={cn(
                      "font-mono flex-1 truncate cursor-pointer", 
                      file.forceExcluded && "line-through text-muted-foreground/80"
                    )}
                    onClick={() => handleToggleFile(file.path)}
                    title={file.path}
                  >
                    {dirPath ? (
                      <>
                        <span className="opacity-60 text-xs">{dirPath}/</span>
                        <span className="font-semibold">{fileName}</span>
                      </>
                    ) : fileName}
                  </span>
                </div>
                <span className="text-muted-foreground text-xs">{formatFileSize(file.size)}</span>
              </div>
            );
          })}
        </ScrollArea>
      ) : (searchTerm || (isRegexActive && (titleRegex || contentRegex))) ? (
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Info className="h-8 w-8" />
          <p>No files match your search criteria</p>
        </div>
      ) : !projectDirectory ? (
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <FolderClosed className="h-8 w-8" />
          <p>Please select a project directory first</p>
        </div>
      ) : Object.keys(allFilesMap || {}).length === 0 ? (
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-destructive/80">
          <AlertCircle className="h-8 w-8" />
          <div className="text-center">
            <p className="font-medium">No files found in the selected directory</p>
            <p className="text-sm mt-1">Try selecting a different directory or check permissions</p>
            <p className="text-xs mt-2 opacity-70">Debug info: Project directory = {projectDirectory || "none"}</p>
          </div>
        </div>
      ) : (
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Info className="h-8 w-8" />
          <p>No files match the current filters</p>
        </div>
      )}
    </div>
  );
} 
"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input"; // Assuming Input exists
import { Dispatch, SetStateAction, useState, useEffect } from "react";
import { cn } from "@/lib/utils"; // Add cn utility for conditional class names
import { ToggleLeft, ToggleRight } from "lucide-react";

interface FileInfo {
  path: string;
  size: number;
  included: boolean;
  forceExcluded: boolean;
}

type FilesMap = { [path: string]: FileInfo };

interface FileBrowserProps {
  displayedFiles: FileInfo[]; // Files matching current filters (search, regex)
  allFilesMap: FilesMap; // All files keyed by path for quick lookup
  searchTerm: string;
  onSearchChange: (value: string) => void; // For the search input itself
  setAllFilesMap: Dispatch<SetStateAction<FilesMap>>; // To update the master list
  titleRegex?: string; // Used only for display context, filtering happens upstream
  contentRegex?: string;
  fileContentsMap?: { [key: string]: string };
  isRegexActive?: boolean; // Add new prop for regex active state
}

// LocalStorage key for the show only selected preference
const SHOW_ONLY_SELECTED_KEY = "file-browser-show-only-selected";

export default function FileBrowser({
  displayedFiles,
  allFilesMap,
  searchTerm,
  onSearchChange,
  setAllFilesMap,
  titleRegex = "", // Prop kept for potential future use or context display
  contentRegex = "",
  isRegexActive = true // Default to true for backward compatibility
}: FileBrowserProps) {
  
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  
  // Load showOnlySelected preference from localStorage on mount
  useEffect(() => {
    const savedPreference = localStorage.getItem(SHOW_ONLY_SELECTED_KEY);
    if (savedPreference !== null) {
      setShowOnlySelected(savedPreference === "true");
    }
  }, []);
  
  // Save showOnlySelected preference to localStorage when it changes
  const toggleShowOnlySelected = () => {
    const newValue = !showOnlySelected;
    setShowOnlySelected(newValue);
    localStorage.setItem(SHOW_ONLY_SELECTED_KEY, String(newValue));
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleToggleFile = (path: string) => {
    setAllFilesMap(prevMap => {
      const newMap = { ...prevMap };
      if (newMap[path]) {
        newMap[path] = { ...newMap[path], included: !newMap[path].included };
      }
      return newMap;
    });
  };

  const handleToggleForceExclude = (path: string) => {
    setAllFilesMap(prevMap => {
      const newMap = { ...prevMap };
      if (newMap[path]) {
        const currentFile = newMap[path];
        const forceExcluded = !currentFile.forceExcluded;
        newMap[path] = {
          ...currentFile,
          forceExcluded,
          included: forceExcluded ? false : currentFile.included, // Force exclude overrides include
        };
      }
      return newMap;
    });
  };

  const handleBulkToggle = (include: boolean) => {
    setAllFilesMap(prevMap => {
      const newMap = { ...prevMap };
      displayedFiles.forEach(file => {
        newMap[file.path] = {
          ...newMap[file.path],
          included: include && !newMap[file.path].forceExcluded
        };
      });
      
      return newMap;
    });
  };

  // Filter files to show only selected if toggle is active
  const filteredDisplayFiles = showOnlySelected 
    ? displayedFiles.filter(file => file.included && !file.forceExcluded)
    : displayedFiles;

  const includedCount = displayedFiles.filter((f) => f.included).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        {displayedFiles.length > 0 && (
          <div className="flex justify-between items-center">
            <label className="font-bold text-foreground">
              Found Files ({displayedFiles.filter((f) => f.included).length}/{displayedFiles.length}):
              {(titleRegex || contentRegex) && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  {isRegexActive 
                    ? "Regex filtering active" 
                    : "Regex filtering paused"}
                </span>
              )}
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleShowOnlySelected}
              className={`p-1 h-auto flex items-center gap-1 ${showOnlySelected ? "text-primary" : "text-muted-foreground"}`}
              title={showOnlySelected ? "Show all files" : "Show only selected files"}
            >
              {showOnlySelected ? (
                <ToggleRight className="h-5 w-5" />
              ) : (
                <ToggleLeft className="h-5 w-5" />
              )}
              <span className="text-xs">
                {showOnlySelected ? "Selected only" : "All files"}
              </span>
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 items-center">
          <Input
            type="text"
            className="border rounded bg-background text-foreground p-2 flex-1"
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search files"
          />
          {displayedFiles.length > 0 && (
            <>
              <Button
                variant="secondary" size="sm"
                onClick={() => handleBulkToggle(false)}
                disabled={displayedFiles.length === 0 || includedCount === 0}
              >
                Exclude Filtered
              </Button>
              <Button
                variant="secondary" size="sm"
                onClick={() => handleBulkToggle(true)}
                disabled={displayedFiles.length === 0 || includedCount === displayedFiles.length}
              >
                Include Filtered
              </Button>
            </>
          )}
        </div>
      </div>

      {filteredDisplayFiles.length > 0 ? (
        <div className="border rounded bg-background p-2 max-h-60 overflow-y-auto">
          {filteredDisplayFiles.map((file) => (
            <div
              key={file.path}
              // Highlight included files slightly
              className={`flex items-center justify-between gap-2 text-sm py-1 hover:bg-accent/50 rounded px-2 ${
                file.included ? "bg-accent" : "" // Highlight included files
              } ${file.forceExcluded ? "opacity-50" : ""}`}
            >
              <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked={file.included}
                  onChange={() => handleToggleFile(file.path)}
                  disabled={file.forceExcluded} // Disable include checkbox if force excluded
                  className="cursor-pointer flex-shrink-0"
                />
                <input
                  type="checkbox"
                  checked={file.forceExcluded}
                  onChange={() => handleToggleForceExclude(file.path)}
                  // Use destructive variant styling for force exclude
                  className={cn("cursor-pointer accent-destructive flex-shrink-0")}
                  title="Force exclude"
                />
                {/* Conditionally apply strikethrough if force excluded */}
                <span className={cn("font-mono flex-1 truncate", file.forceExcluded && "line-through")}>{file.path}</span>
              </label>
              <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
            </div>
          ))}
        </div>
      ) : showOnlySelected && displayedFiles.length > 0 ? (
        <div className="border rounded bg-background p-2 text-muted-foreground text-center py-2">
          No files are selected
        </div>
      ) : (searchTerm || (isRegexActive && (titleRegex || contentRegex))) ? (
        <div className="border rounded bg-background p-2 text-muted-foreground text-center py-2">
          No files match your search
        </div>
      ) : null}
    </div>
  );
} 
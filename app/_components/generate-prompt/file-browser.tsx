"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Info, ToggleLeft, ToggleRight, Loader2, FileText, FolderClosed, AlertCircle, X, Copy } from "lucide-react"; // Added X and Copy imports
import { cn } from "@/lib/utils"; // Keep cn import
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/lib/contexts/project-context";
import { useDatabase } from "@/lib/contexts/database-context";
import { formatPathForDisplay } from "@/lib/path-utils";
import { FileInfo } from "@/types";

type FilesMap = { [path: string]: FileInfo };

interface FileBrowserProps {
  allFilesMap?: FilesMap; // Optional map of all files
  fileContentsMap?: { [key: string]: string }; // Add file contents map
  onFilesMapChange?: (newMap: FilesMap) => void;
  searchTerm?: string;
  onSearchChange: (value: string) => void; // Make required
  titleRegex: string; // Rename from fileTitleRegex
  contentRegex: string;
  isRegexActive: boolean;
  titleRegexError: string | null; // Add error state props
  contentRegexError: string | null;
  onTitleRegexErrorChange: (error: string | null) => void; // Add error handler props
  onContentRegexErrorChange: (error: string | null) => void;
  onInteraction?: () => void;
  debugMode?: boolean;
  isLoading?: boolean; // Add loading state
  loadingMessage?: string; // Add loading message prop
  onAddPath?: (path: string) => void; // New prop for adding path to textarea
  // Legacy prop names
  files?: FilesMap; // Keep for backward compatibility
  onFilesChange?: (newMap: FilesMap) => void; // Keep for backward compatibility
  searchFilter?: string;
}

const SHOW_ONLY_SELECTED_KEY = "file-browser-show-only-selected";

export default function FileBrowser({
  allFilesMap: propsAllFilesMap,
  fileContentsMap = {}, // Default to empty object
  files: propsFiles,
  onFilesMapChange, // Use this preferred prop name
  onFilesChange,
  searchTerm: propSearchTerm,
  searchFilter,
  onSearchChange = () => {},
  titleRegexError,
  contentRegexError, // Keep contentRegexError prop
  onTitleRegexErrorChange,
  onContentRegexErrorChange,
  titleRegex, // Keep titleRegex prop
  contentRegex,
  isRegexActive,
  onInteraction,
  isLoading,
  loadingMessage = "", // Add default empty string for loadingMessage
  onAddPath, // Add new prop
}: FileBrowserProps) { // Keep FileBrowserProps type
  // Normalize props to use both naming conventions
  const allFilesMap = propsAllFilesMap || propsFiles || {};
  // Handle legacy search prop name
  const searchTerm = propSearchTerm || searchFilter || "";

  const { projectDirectory } = useProject();
  const { repository } = useDatabase();
  const [showOnlySelected, setShowOnlySelected] = useState<boolean>(false);
  const [showPathInfo, setShowPathInfo] = useState(false);
  const lastRenderedMapRef = useRef<string | null>(null); // Track rendered file list
  const [isPreferenceLoading, setIsPreferenceLoading] = useState(true);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const handleSearchChangeInternal = (value: string) => {
    onSearchChange(value);
    if (onInteraction) onInteraction(); // Call interaction handler
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
    setIsPreferenceLoading(true); // Set loading state for preference
    const loadPreference = async () => { // Keep loadPreference function
      if (repository && projectDirectory) {
        try {
          const savedPreference = await repository.getCachedState(
            projectDirectory,
            SHOW_ONLY_SELECTED_KEY
          );
          setShowOnlySelected(savedPreference === "true");
        } catch (e) {
          console.error("Failed to load 'showOnlySelected' preference:", e);
        } finally {
          setIsPreferenceLoading(false);
        } // Always reset loading state
      } else {
        setIsPreferenceLoading(false); // Reset loading state if dependencies missing
      }
    };

    loadPreference();
  }, [projectDirectory, repository]); // Removed outputFormat dependency
  // Keep toggleShowOnlySelected function
  const toggleShowOnlySelected = async () => { // Make async to save preference
    const newValue = !showOnlySelected;
    setShowOnlySelected(newValue);
    if (projectDirectory && repository) { // Check dependencies before saving 
      try {
        await repository.saveCachedState(
          projectDirectory,
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
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; // Keep MB calculation
  };

  const handleToggleFile = (path: string) => {
    const newMap = { ...allFilesMap };
    if (newMap[path]) { // Check if file exists in map
      const currentFile = newMap[path]; // Get current state
      const newIncluded = !currentFile.included; // Toggle the included state
      
      newMap[path] = { 
        ...currentFile, 
        included: newIncluded,
        // If we're including the file, also make sure it's not force excluded
        forceExcluded: newIncluded ? false : currentFile.forceExcluded 
      };
      
      // Log state changes for debugging
      console.log(`[FileBrowser] Toggled file ${path}: included=${newIncluded}, forceExcluded=${newMap[path].forceExcluded}`);
    } else {
      console.warn(`[FileBrowser] Attempted to toggle nonexistent file: ${path}`);
    }
    handleFilesMapChangeInternal(newMap);
  };

  const handleToggleForceExclude = (path: string) => {
    const newMap = { ...allFilesMap };
    if (newMap[path]) { // Check if file exists in map
      const currentFile = newMap[path];
      const newForceExcluded = !currentFile.forceExcluded; // Toggle force excluded
      
      newMap[path] = {
        ...currentFile,
        forceExcluded: newForceExcluded,
        // Force excluded files cannot be included
        included: newForceExcluded ? false : currentFile.included,
      };
      
      // Log state changes for debugging
      console.log(`[FileBrowser] Toggled force exclude for ${path}: forceExcluded=${newForceExcluded}, included=${newMap[path].included}`);
    } else {
      console.warn(`[FileBrowser] Attempted to toggle force exclude on nonexistent file: ${path}`);
    }
    handleFilesMapChangeInternal(newMap);
  };

  // Specific handler for toggling force exclude OFF via filename click
  // This makes the file included immediately when force exclude is removed by clicking the filename.
  const handleToggleForceExcludeOffAndInclude = (path: string) => {
    const newMap = { ...allFilesMap };
    if (newMap[path]) {
      const currentFile = newMap[path];
      
      // Update the file state
      newMap[path] = {
        ...currentFile,
        forceExcluded: false, // Turn off force exclude
        included: true,      // Turn on include
      };
      
      // Log state changes for debugging
      console.log(`[FileBrowser] Un-force-excluded and included file ${path}`);
    } else {
      console.warn(`[FileBrowser] Attempted to un-force-exclude nonexistent file: ${path}`);
    }
    handleFilesMapChangeInternal(newMap);
  };
  const handleBulkToggle = useCallback((include: boolean, filesToToggle: FileInfo[]) => {
    // Create a new map to avoid direct state mutation
    const newMap = { ...allFilesMap };
    let changedCount = 0;
    
    // Only process files that exist in the map
    filesToToggle.forEach(file => {
      const path = file.path;
      const currentFile = newMap[path]; 
      
      if (currentFile) {
        const oldIncluded = currentFile.included;
        const oldForceExcluded = currentFile.forceExcluded;
        
        // Update the file state based on the include parameter
        if (include) {
          // Including files - also remove force exclude
          currentFile.included = true;
          currentFile.forceExcluded = false;
        } else {
          // Just exclude the file without changing force excluded status
          currentFile.included = false;
        }
        
        // Check if the state actually changed
        if (oldIncluded !== currentFile.included || oldForceExcluded !== currentFile.forceExcluded) {
          changedCount++;
        }
      }
    });
    
    // Only update if changes were made
    if (changedCount > 0) {
      console.log(`[FileBrowser] Bulk ${include ? 'included' : 'excluded'} ${changedCount} files`);
      handleFilesMapChangeInternal(newMap);
    } else {
      console.log(`[FileBrowser] Bulk toggle had no effect - no files changed state`);
    }
  }, [allFilesMap, handleFilesMapChangeInternal]);

  // Filter files based on search and showOnlySelected
  const filteredDisplayFiles = useMemo(() => {
    if (!allFilesMap || Object.keys(allFilesMap).length === 0) return []; // Guard against empty/null map
    let filesToFilter = Object.values(allFilesMap);
    let filteredFiles: FileInfo[] = [];

    // console.log(`[FileBrowser Memo] Initial filesToFilter count: ${filesToFilter.length}`); // Debug log

    // --- 1. Filter by Search Term ---
    const lowerSearchTerm = searchTerm.toLowerCase();
    if (lowerSearchTerm) {
      filesToFilter = filesToFilter.filter(file =>
        // Check if file.path exists before calling toLowerCase
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

      if (hasTitleRegex || hasContentRegex) { // Only filter if a regex pattern exists
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
            const regex = new RegExp(contentRegexTrimmed, 'm'); // Use multiline flag
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

    // Dependencies for filtering logic
    // Including fileContentsMap is crucial for content regex filtering
  }, [allFilesMap, searchTerm, showOnlySelected, isRegexActive, titleRegex, contentRegex, fileContentsMap, titleRegexError, contentRegexError, onTitleRegexErrorChange, onContentRegexErrorChange]);

  // Sort files for display - group by directories first then alphabetically
  const displayedFiles = useMemo(() => {
    return filteredDisplayFiles.sort((a, b) => {
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
    }); // Close sort function
  }, [filteredDisplayFiles]);

  const includedCount = useMemo(() => 
    allFilesMap 
      ? Object.values(allFilesMap).filter((f) => f.included && !f.forceExcluded).length // Correct calculation
      : 0, 
    [allFilesMap]
  );
  
  const totalFilesCount = useMemo(() => 
    allFilesMap ? Object.keys(allFilesMap).length : 0, // Correct calculation
    [allFilesMap]
  );

  // Log the allFilesMap for debugging
  useEffect(() => {
    console.log(`FileBrowser: Total files count = ${totalFilesCount}, Files Map:`, allFilesMap);
  }, [allFilesMap, totalFilesCount]);

  const getDisplayPath = useCallback((filePath: string): string => {
    return formatPathForDisplay(filePath); // Use utility function
  }, []);

  // Replace handleCopyPath with handleAddPath
  const handleAddPath = useCallback(async (path: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click handlers
    
    // Call the callback if provided
    if (onAddPath) {
      onAddPath(path);
      
      // Set visual feedback
      setCopiedPath(path);
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedPath(null);
      }, 2000);
    }
  }, [onAddPath]);

  return (
    <div className="space-y-4 mb-4 border rounded-lg p-4 bg-card shadow-sm"> {/* Added padding and border */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            type="search" // Use search type for better semantics and potential browser clear button
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => handleSearchChangeInternal(e.target.value)}
            className="w-full" // Ensure input takes full width
          />
        </div>
        {searchTerm && ( // Show clear button only if search term exists
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleSearchChangeInternal("")}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
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
            
            {filteredDisplayFiles.length > 0 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary" size="sm"
                  onClick={() => handleBulkToggle(false, filteredDisplayFiles)}
                  disabled={filteredDisplayFiles.length === 0 || includedCount === 0}
                  className="h-9" // Keep existing style
                > {/* Close Button */}
                  Deselect Visible
                </Button>
                <Button
                  type="button"
                  variant="secondary" size="sm"
                  onClick={() => handleBulkToggle(true, filteredDisplayFiles)}
                  disabled={filteredDisplayFiles.length === 0 || filteredDisplayFiles.every(f => f.included || f.forceExcluded)}
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
      {isLoading ? (
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <div className="text-center"> {/* Center text */}
            <p className="font-medium">Loading files...</p>
            {loadingMessage && <p className="text-sm">{loadingMessage}</p>}
          </div>
        </div>
      ) : displayedFiles.length > 0 ? (
        <div className="border rounded bg-background/50 p-2 h-[450px] overflow-auto">
          {displayedFiles.map((file) => {
            // Extract directory part for grouping
            const pathParts = file.path.split('/');
            const fileName = pathParts.pop() || '';
            const dirPath = pathParts.join('/');
            
            // Create a stable unique key for this file
            const fileKey = `file-${file.path}-${file.included ? 1 : 0}-${file.forceExcluded ? 1 : 0}`;
            
            return (
              <div
                key={fileKey}
                className={cn(
                  "flex items-center justify-between gap-2 text-sm py-1.5 hover:bg-accent/50 rounded px-2",
                  file.included && !file.forceExcluded ? "bg-primary/5" : "", // Use primary color hint for included
                  file.forceExcluded ? "opacity-60" : ""
                )} // Keep styling
                // Add file info as data attributes for debugging
                data-path={file.path}
                data-included={String(!!file.included)}
                data-excluded={String(!!file.forceExcluded)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Use non-controlled checkbox pattern with proper checked attribute */}
                  <div className="flex items-center cursor-pointer" onClick={() => handleToggleFile(file.path)}>
                    <input
                      type="checkbox"
                      checked={!!file.included}
                      readOnly
                      className="cursor-pointer flex-shrink-0 accent-primary" 
                      title="Include file in generation"
                      aria-label={`Include ${file.path}`}
                    />
                  </div>
                  <div 
                    className="flex items-center cursor-pointer" 
                    onClick={() => handleToggleForceExclude(file.path)}
                    title="Force Exclude (cannot be included)"
                  >
                    <input
                      type="checkbox"
                      checked={!!file.forceExcluded}
                      className={cn("cursor-pointer accent-destructive flex-shrink-0 w-3.5 h-3.5")}
                      readOnly
                      aria-label={`Force exclude ${file.path}`}
                    />
                  </div>
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" /> {/* File icon */}
                  <span
                    className={cn(
                      "font-mono flex-1 truncate cursor-pointer", 
                      file.forceExcluded && "line-through text-muted-foreground/80"
                    )}
                    onClick={() => file.forceExcluded ? handleToggleForceExcludeOffAndInclude(file.path) : handleToggleFile(file.path)}
                    title={`${file.path}${file.forceExcluded ? ' (force excluded)' : file.included ? ' (included)' : ' (not included)'}`}
                  >
                    {dirPath ? (
                      <> {/* Show directory path if it exists */}
                        <span className="opacity-60 text-xs">{dirPath}/</span>
                        <span className="font-semibold">{fileName}</span>
                      </>
                    ) : fileName} {/* Otherwise show just the filename */}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={(e) => handleAddPath(file.path, e)}
                    className={cn(
                      "h-6 w-6 rounded-sm flex items-center justify-center hover:bg-accent/70 transition-colors",
                      copiedPath === file.path ? "text-primary" : "text-muted-foreground"
                    )}
                    title="Add file path to selection"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (searchTerm || (isRegexActive && (titleRegex || contentRegex))) ? ( // Condition for no matches
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Info className="h-8 w-8" />
          <p>No files match your search criteria</p>
        </div>
      ) : !projectDirectory ? (
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <FolderClosed className="h-8 w-8" />
          <p>Please select a project directory first</p>
        </div>
      ) : totalFilesCount === 0 ? ( // Use totalFilesCount for check
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-destructive/80">
          <AlertCircle className="h-8 w-8" />
          <div className="text-center">
            <p className="font-medium">No files found in the selected directory</p>
            <p className="text-sm mt-1">Try selecting a different directory or check permissions</p>
            <p className="text-xs mt-2 opacity-70">Debug info: Project directory = {projectDirectory || "none"}</p>
          </div>
        </div>
      ) : ( // Fallback case
        <div className="border rounded bg-background p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Info className="h-8 w-8" />
          <p>No files match the current filters</p>
        </div>
      )}
    </div>
  );
}

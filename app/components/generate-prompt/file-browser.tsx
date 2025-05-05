"use client";

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { Info, ToggleLeft, ToggleRight, Loader2, FileText, FolderClosed, AlertCircle, X, Copy, RefreshCw, FileCheck, Files } from "lucide-react"; // Kept imports
import { cn } from "@/lib/utils"; // Keep cn import
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/lib/contexts/project-context";
import { formatPathForDisplay } from "@/lib/path-utils";
import { FileInfo } from "@/types";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Constants for auto-retry logic
const AUTO_RETRY_DELAY = 2000; // 2 seconds delay for auto-retry
const MAX_AUTO_RETRIES = 3; // Maximum number of automatic retries

type FilesMap = { [path: string]: FileInfo };

interface FileBrowserProps {
  allFilesMap?: FilesMap; // Optional map of all files
  fileContentsMap?: { [key: string]: string }; // Add file contents map
  onFilesMapChange?: (newMap: FilesMap) => void;
  searchTerm?: string;
  onSearchChange: (value: string) => void; // Make required
  titleRegex: string; // Rename from fileTitleRegex
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
  isRegexActive: boolean;
  titleRegexError: string | null; // Add error state props
  contentRegexError: string | null;
  negativeTitleRegexError: string | null;
  negativeContentRegexError: string | null;
  onTitleRegexErrorChange: (error: string | null) => void; // Add error handler props
  onContentRegexErrorChange: (error: string | null) => void;
  onNegativeTitleRegexErrorChange: (error: string | null) => void;
  onNegativeContentRegexErrorChange: (error: string | null) => void;
  onInteraction?: () => void;
  refreshFiles?: (preserveState?: boolean) => Promise<void>; // Restore preserveState parameter
  debugMode?: boolean;
  isLoading?: boolean; // Add loading state
  loadingMessage?: string; // Add loading message prop
  onAddPath?: (path: string) => void; // New prop for adding path to textarea
  saveFileSelections?: () => Promise<void>; // Update return type
  // New props for showOnlySelected state synchronization
  showOnlySelected?: boolean;
  onShowOnlySelectedChange?: () => void;
  onToggleSelection?: (path: string) => void;
}

const SHOW_ONLY_SELECTED_KEY = "file-browser-show-only-selected";
const DEBUG_LOGS = process.env.NODE_ENV === 'development';

export default function FileBrowser({
  allFilesMap: propsAllFilesMap,
  fileContentsMap = {}, // Default to empty object
  onFilesMapChange,
  searchTerm: propSearchTerm,
  onSearchChange = () => {},
  titleRegexError,
  contentRegexError,
  negativeTitleRegexError,
  negativeContentRegexError,
  onTitleRegexErrorChange = () => {},
  onContentRegexErrorChange = () => {},
  onNegativeTitleRegexErrorChange = () => {},
  onNegativeContentRegexErrorChange = () => {},
  titleRegex,
  contentRegex,
  negativeTitleRegex,
  negativeContentRegex,
  isRegexActive,
  onInteraction,
  refreshFiles,
  isLoading,
  loadingMessage = "",
  onAddPath,
  showOnlySelected: propShowOnlySelected,
  onShowOnlySelectedChange,
  saveFileSelections,
  onToggleSelection,
}: FileBrowserProps) {
  const { projectDirectory } = useProject();
  
  // Only log in development mode
  if (DEBUG_LOGS) {
    console.log(`[FileBrowser] Component rendered with:
      - projectDirectory: ${projectDirectory || 'not set'}
      - allFilesMap size: ${propsAllFilesMap ? Object.keys(propsAllFilesMap).length : 0}
      - isLoading: ${isLoading}
    `);
  }
  
  // Get file map
  const allFilesMap = useMemo(() => {
    const result = propsAllFilesMap || {};
    return result;
  }, [propsAllFilesMap]);
  
  // Log file map details separately (outside of memo)
  useEffect(() => {
    if (DEBUG_LOGS) {
      const fileCount = Object.keys(allFilesMap).length;
      console.log(`[FileBrowser] FilesMap has ${fileCount} entries, isLoading=${isLoading}`);
    }
  }, [allFilesMap, isLoading]);
  
  // Get search term
  const searchTerm = propSearchTerm || "";

  const [localShowOnlySelected, setLocalShowOnlySelected] = useState<boolean>(false);
  
  // Use the prop value if provided, otherwise use local state
  const showOnlySelected = propShowOnlySelected !== undefined ? propShowOnlySelected : localShowOnlySelected;
  
  const [showPathInfo, setShowPathInfo] = useState(false);
  const lastRenderedMapRef = useRef<string | null>(null); // Track rendered file list
  const [isPreferenceLoading, setIsPreferenceLoading] = useState(true);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  
  // Update the handleManualRefresh function to use the refreshFiles prop
  const handleManualRefresh = useCallback(() => {
    // Call refreshFiles if provided (real refresh)
    if (refreshFiles) {
      console.log("[FileBrowser] Performing manual refresh with preserveState=true");
      refreshFiles(true).catch(error => {
        console.error("[FileBrowser] Error refreshing files:", error);
      });
    }
    
    // Also call onInteraction for compatibility with the existing code
    if (onInteraction) {
      onInteraction();
    }
  }, [refreshFiles, onInteraction]);

  // Only load from localStorage if no prop is provided
  useEffect(() => {
    if (propShowOnlySelected === undefined) {
      setIsPreferenceLoading(true); // Set loading state for preference
      
      // Load preference from localStorage instead of repository
      const loadPreference = () => {
        if (projectDirectory) {
          try {
            const key = `${SHOW_ONLY_SELECTED_KEY}-${projectDirectory}`;
            const savedPreference = localStorage.getItem(key);
            setLocalShowOnlySelected(savedPreference === "true");
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
    }
  }, [projectDirectory, propShowOnlySelected]);
  
  // Update toggleShowOnlySelected to use either the provided callback or local storage
  const toggleShowOnlySelected = () => {
    if (onShowOnlySelectedChange) {
      // Use parent's toggle function
      onShowOnlySelectedChange();
    } else {
      // Use local state and storage
      const newValue = !localShowOnlySelected;
      setLocalShowOnlySelected(newValue);
      
      if (projectDirectory) {
        try {
          const key = `${SHOW_ONLY_SELECTED_KEY}-${projectDirectory}`;
          localStorage.setItem(key, String(newValue));
        } catch (error) {
          console.error("Failed to save 'showOnlySelected' preference:", error);
        }
      }
    }
  };

  const formatFileSize = (sizeInBytes: number | undefined) => {
    // Handle undefined size values
    const bytes = sizeInBytes ?? 0;
    
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; // Keep MB calculation
  };

  // Define handleFilesMapChangeInternal before it's used in other callbacks
  const handleFilesMapChangeInternal = useCallback((newMap: FilesMap) => {
    if (onFilesMapChange) {
      onFilesMapChange(newMap);
    }
    if (onInteraction) {
      onInteraction();
    }
  }, [onFilesMapChange, onInteraction]);
  
  // Define handleSearchChangeInternal before it's used
  const handleSearchChangeInternal = (value: string) => {
    onSearchChange(value);
    if (onInteraction) {
      onInteraction();
    }
  };

  const handleToggleFile = useCallback((path: string) => {
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
    
    // Call saveFileSelections if provided
    if (saveFileSelections) {
      console.log(`[FileBrowser] Triggering immediate save of file selections after toggle`);
      saveFileSelections();
    }
  }, [allFilesMap, handleFilesMapChangeInternal, saveFileSelections]);

  const handleToggleForceExclude = useCallback((path: string) => {
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
    
    // Call saveFileSelections if provided
    if (saveFileSelections) {
      console.log(`[FileBrowser] Triggering immediate save of file selections after force exclude toggle`);
      saveFileSelections();
    }
  }, [allFilesMap, handleFilesMapChangeInternal, saveFileSelections]);

  // Specific handler for toggling force exclude OFF via filename click
  // This makes the file included immediately when force exclude is removed by clicking the filename.
  const handleToggleForceExcludeOffAndInclude = useCallback((path: string) => {
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
      console.log(`[FileBrowser] Un-force-excluded and included file ${path}: included=true, forceExcluded=false`);
    }
    handleFilesMapChangeInternal(newMap);
    
    // Call saveFileSelections if provided
    if (saveFileSelections) {
      console.log(`[FileBrowser] Triggering immediate save of file selections after un-force-exclude`);
      saveFileSelections();
    }
  }, [allFilesMap, handleFilesMapChangeInternal, saveFileSelections]);

    // Handler for clearing the search term
    const handleClearSearch = () => {
        handleSearchChangeInternal(""); // Call the internal handler with empty string
        // No need to call onInteraction here, as handleSearchChangeInternal already does
    };

  // Filter files based on search and showOnlySelected
  const filteredDisplayFiles = useMemo(() => {
    // Skip filtering if files are empty. However, if we're loading but already have files,
    // we still want to show those with a loading indicator rather than an empty state
    if (!allFilesMap || Object.keys(allFilesMap).length === 0) return []; 
    
    let filesToFilter = Object.values(allFilesMap);
    let filteredFiles: FileInfo[] = [];

    // --- 1. Filter by Search Term ---
    const lowerSearchTerm = searchTerm.toLowerCase();
    if (lowerSearchTerm) {
      filesToFilter = filesToFilter.filter(file =>
        // Check if file.path exists before calling toLowerCase
        file.path.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // --- 2. Filter by Positive Regex (if active) ---
    let currentTitleError: string | null = null;
    let currentContentError: string | null = null;
    let currentNegativeTitleError: string | null = null;
    let currentNegativeContentError: string | null = null;
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

      // --- 3. Apply Negative Regex Filtering (exclude matches) ---
      const negativeTitleRegexTrimmed = negativeTitleRegex.trim();
      const negativeContentRegexTrimmed = negativeContentRegex.trim();
      const hasNegativeTitleRegex = !!negativeTitleRegexTrimmed;
      const hasNegativeContentRegex = !!negativeContentRegexTrimmed;
      
      if (hasNegativeTitleRegex || hasNegativeContentRegex) {
        // Files to be excluded based on negative patterns
        const excludeByNegativeRegex = new Set<string>();
        
        // Apply negative title regex
        if (hasNegativeTitleRegex) {
          try {
            const regex = new RegExp(negativeTitleRegexTrimmed);
            filteredFiles.forEach(file => {
              if (regex.test(file.path)) {
                excludeByNegativeRegex.add(file.path);
              }
            });
            currentNegativeTitleError = null;
          } catch (e) {
            currentNegativeTitleError = e instanceof Error ? e.message : "Invalid negative title regex";
            console.error("Negative Title Regex Error:", e);
          }
        }
        
        // Apply negative content regex
        if (hasNegativeContentRegex && hasFileContents) {
          try {
            const regex = new RegExp(negativeContentRegexTrimmed, 'm');
            filteredFiles.forEach(file => {
              const content = fileContentsMap[file.path];
              if (typeof content === 'string' && regex.test(content)) {
                excludeByNegativeRegex.add(file.path);
              }
            });
            currentNegativeContentError = null;
          } catch (e) {
            currentNegativeContentError = e instanceof Error ? e.message : "Invalid negative content regex";
            console.error("Negative Content Regex Error:", e);
          }
        }
        
        // Exclude files that match negative patterns
        if (excludeByNegativeRegex.size > 0) {
          filteredFiles = filteredFiles.filter(file => !excludeByNegativeRegex.has(file.path));
        }
      }
    } else {
      // Regex is inactive, just use the search-filtered list
      filteredFiles = filesToFilter;
    }

    // Set errors outside the main filtering logic if they changed
    if (currentTitleError !== titleRegexError) onTitleRegexErrorChange(currentTitleError);
    if (currentContentError !== contentRegexError) onContentRegexErrorChange(currentContentError);
    if (currentNegativeTitleError !== negativeTitleRegexError) onNegativeTitleRegexErrorChange(currentNegativeTitleError);
    if (currentNegativeContentError !== negativeContentRegexError) onNegativeContentRegexErrorChange(currentNegativeContentError);

    // --- 4. Filter by "Show Only Selected" ---
    if (showOnlySelected) {
      filteredFiles = filteredFiles.filter(file => file.included && !file.forceExcluded);
    }

    return filteredFiles;

    // Dependencies for filtering logic
    // Including fileContentsMap is crucial for content regex filtering
  }, [
    allFilesMap, 
    searchTerm, 
    showOnlySelected, 
    isRegexActive, 
    titleRegex, 
    contentRegex, 
    negativeTitleRegex,
    negativeContentRegex,
    fileContentsMap, 
    titleRegexError, 
    contentRegexError,
    negativeTitleRegexError,
    negativeContentRegexError,
    onTitleRegexErrorChange, 
    onContentRegexErrorChange,
    onNegativeTitleRegexErrorChange,
    onNegativeContentRegexErrorChange
  ]);

  const handleBulkToggle = useCallback((shouldInclude: boolean) => {
    // Clone the map
    const newMap = { ...allFilesMap };
    let changedCount = 0;
    
    // Update each filtered file
    filteredDisplayFiles.forEach(file => {
      // Skip if already in the desired state
      if (file.included === shouldInclude) return;
      
      newMap[file.path] = {
        ...newMap[file.path],
        included: shouldInclude,
        // If including, make sure not force excluded
        forceExcluded: shouldInclude ? false : newMap[file.path].forceExcluded
      };
      changedCount++;
    });
    
    if (changedCount > 0) {
      console.log(`[FileBrowser] Bulk ${shouldInclude ? 'selected' : 'deselected'} ${changedCount} files`);
      handleFilesMapChangeInternal(newMap);
      
      // Call saveFileSelections if provided
      if (saveFileSelections) {
        console.log(`[FileBrowser] Triggering immediate save of file selections after bulk toggle (${changedCount} files)`);
        saveFileSelections();
      }
    }
  }, [allFilesMap, filteredDisplayFiles, handleFilesMapChangeInternal, saveFileSelections]);

  // Sort files for display - group by directories first then alphabetically
  const displayedFiles = useMemo(() => {
    // Only skip if no files to display
    if (filteredDisplayFiles.length === 0) return [];
    
    return [...filteredDisplayFiles].sort((a, b) => {
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
  }, [filteredDisplayFiles]);

  const includedCount = useMemo(() => 
    !allFilesMap 
      ? 0 
      : Object.values(allFilesMap).filter((f) => f.included && !f.forceExcluded).length,
    [allFilesMap]
  );
  
  const totalFilesCount = useMemo(() => 
    !allFilesMap 
      ? 0 
      : Object.keys(allFilesMap).length,
    [allFilesMap]
  );

  // Track file changes for debugging (only in development mode)
  useEffect(() => {
    if (!DEBUG_LOGS) return;
    
    const fileCount = Object.keys(allFilesMap).length;
    const selectedCount = Object.values(allFilesMap).filter(f => f.included && !f.forceExcluded).length;
    
    // Create a unique hash of the file state for change detection
    const mapHash = JSON.stringify({
      count: fileCount,
      selected: selectedCount
    });
    
    if (lastRenderedMapRef.current !== mapHash) {
      console.log(`[FileBrowser] Files updated: ${fileCount} total files, ${selectedCount} selected files`);
      lastRenderedMapRef.current = mapHash;
    }
  }, [allFilesMap]);

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
        // Only reset if the current copied path is still the one we set
        setCopiedPath(currentPath => currentPath === path ? null : currentPath);
      }, 2000);
    }
  }, [onAddPath]);

  return (
    // Use key to force re-render when projectDirectory changes, ensuring cache state is reset
    <div className="space-y-4 mb-4 border rounded-lg p-4 bg-card shadow-sm"> 
      {/* Debug data to help troubleshoot issues */}
      {DEBUG_LOGS && (
        <div className="bg-gray-100 text-xs font-mono p-2 rounded mb-2 text-gray-700">
          allFilesMap: {Object.keys(allFilesMap).length} files | 
          filtered: {filteredDisplayFiles.length} | 
          displayed: {displayedFiles.length} | 
          loading: {isLoading ? 'yes' : 'no'}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1"> {/* Added relative positioning */}
          <Input
            type="search" // Use search type for better semantics and potential browser clear button
            placeholder="Search files..."
            value={searchTerm}
            onChange={(e) => handleSearchChangeInternal(e.target.value)}
            className="w-full" // Ensure input takes full width
          />
          {searchTerm && ( // Show clear button only if search term exists
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleSearchChangeInternal("")}
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
              <FileCheck className="h-4 w-4 text-primary" />
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
            onCheckedChange={toggleShowOnlySelected}
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
                  onClick={() => handleBulkToggle(false)}
                  disabled={filteredDisplayFiles.length === 0 || includedCount === 0}
                  className="h-9" // Keep existing style
                > {/* Close Button */}
                  Deselect Visible
                </Button>
                <Button
                  type="button"
                  variant="secondary" size="sm"
                  onClick={() => handleBulkToggle(true)}
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
        
        {/* Debug info */}
        {DEBUG_LOGS && (
          <div className="text-xs bg-gray-100 p-2 mb-2 rounded font-mono">
            displayedFiles: {displayedFiles.length},
            filteredDisplayFiles: {filteredDisplayFiles.length},
            totalFilesCount: {totalFilesCount},
            isLoading: {isLoading ? 'true' : 'false'}
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
            ) : searchTerm || (isRegexActive && (titleRegex || contentRegex || negativeTitleRegex || negativeContentRegex)) ? (
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
                    title={`${file.path}${file.forceExcluded ? " (force excluded)" : file.included ? " (included)" : " (not included)"}`}
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
                  <Button
                    variant="ghost" size="icon"
                    onClick={(e) => handleAddPath(file.path, e)}
                    className={cn(
                      "h-6 w-6 rounded-sm flex items-center justify-center hover:bg-accent/70 transition-colors",
                      copiedPath === file.path ? "text-primary" : "text-muted-foreground"
                    )}
                    title="Add file path to selection"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          </>
        )}
      </div>
    </div>
  );
}

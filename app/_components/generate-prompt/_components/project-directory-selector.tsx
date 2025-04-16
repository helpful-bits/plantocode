"use client";

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation"; // URL sync
import { AlertCircle, Check, FolderOpen, Loader2, RefreshCw, Trash2, X, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input"; // Keep Input import
import { Button } from "@/components/ui/button";
import { validateDirectoryAction } from "@/actions/validate-directory-action";
import { normalizePath } from "@/lib/path-utils";
import { useDatabase } from "@/lib/contexts/database-context";
import { useProject } from "@/lib/contexts/project-context";
import { PROJECT_DIR_HISTORY_CACHE_KEY, MAX_PROJECT_DIR_HISTORY, GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import DirectoryBrowser from "./directory-browser";

enum ValidationType {
  Success = 'success',
  Error = 'error',
  Info = 'info',
  Loading = 'loading',
}

export default function ProjectDirectorySelector({ onRefresh, isRefreshing }: { onRefresh?: () => Promise<void>, isRefreshing?: boolean }) {
  const { projectDirectory, setProjectDirectory } = useProject(); // Project context
  const { repository, isInitialized: dbInitialized } = useDatabase(); // DB context
  const [history, setHistory] = useState<string[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{ type: ValidationType; message: string } | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDirectoryBrowserOpen, setIsDirectoryBrowserOpen] = useState(false);
  const [isPending, startTransition] = useTransition(); // For URL updates
  const [isUpdatingFromUrl, setIsUpdatingFromUrl] = useState(false);
  const [isUpdatingFromContext, setIsUpdatingFromContext] = useState(false);

  // URL handling
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  
  // Load history from DB when initialized
  useEffect(() => {
    if (!dbInitialized || !repository) return;
    
    const loadHistory = async () => {
      try {
        const historyData = await repository.getCachedState("global", PROJECT_DIR_HISTORY_CACHE_KEY);
        if (historyData) {
          const parsed = JSON.parse(historyData);
          if (Array.isArray(parsed)) {
            setHistory(parsed);
            return;
          }
        }
        
        // Initialize with empty array if no history or invalid format
        setHistory([]);
      } catch (e) {
        console.error("Failed to load project directory history:", e);
        setHistory([]);
        
        try {
          await repository.saveCachedState("global", PROJECT_DIR_HISTORY_CACHE_KEY, "[]");
        } catch (err) {
          console.error("Failed to initialize history data:", err);
        }
      }
    };
    loadHistory();
  }, [repository, dbInitialized]); // Depend on DB initialization

  // Sync input value from URL on initial load and URL changes
  useLayoutEffect(() => {
    // Avoid circular updates
    if (isUpdatingFromContext) return;

    // Get URL directory
    const urlDirRaw = searchParams.get('projectDir');
    const urlDir = urlDirRaw ? normalizePath(decodeURIComponent(urlDirRaw)) : null;
    
    // Get context directory
    const contextDir = projectDirectory && projectDirectory !== GLOBAL_PROJECT_DIR_KEY ? normalizePath(projectDirectory) : "";
    
    // Only update if URL has a directory and it's different from the current value
    if (urlDir && urlDir !== inputValue) {
      console.log(`[Selector] Updating input from URL: ${urlDir}`);
      setInputValue(urlDir);
      
      // If context doesn't match URL, update context
      if (urlDir !== contextDir) {
        console.log(`[Selector] Updating context from URL: ${urlDir}`);
        setIsUpdatingFromUrl(true);
        setProjectDirectory(urlDir);
        setIsUpdatingFromUrl(false);
      }
    }
  }, [searchParams, projectDirectory, setProjectDirectory, inputValue]);

  // Update input field when projectDirectory context changes (but only if not triggered by URL)
  useEffect(() => {
    // Skip if change was triggered by URL or empty
    if (isUpdatingFromUrl) return;
    
    const contextDir = projectDirectory && projectDirectory !== GLOBAL_PROJECT_DIR_KEY ? normalizePath(projectDirectory) : "";
    
    // Only update if there's a real context value and it's different from input
    if (contextDir && contextDir !== inputValue) {
      console.log(`[Selector] Updating input and URL from context: ${contextDir}`);
      setInputValue(contextDir);
      
      // Update URL to match context (with flag to prevent circular updates)
      setIsUpdatingFromContext(true);
      const newUrl = `${pathname}?projectDir=${encodeURIComponent(contextDir)}`;
      startTransition(() => {
        router.replace(newUrl, { scroll: false });
        // Clear the flag after URL update completes
        setTimeout(() => setIsUpdatingFromContext(false), 0);
      });
    }
  }, [projectDirectory, inputValue, pathname, router]);

  // Add a directory to history
  const addToHistory = useCallback((dir: string) => {
    const normalizedDir = normalizePath(dir?.trim() || "");
    if (!normalizedDir || !repository) return; // Add repository check

    setHistory((prevHistory) => {
      const newHistory = [normalizedDir, ...prevHistory.filter((item) => normalizePath(item) !== normalizedDir)];
      const limitedHistory = newHistory.slice(0, MAX_PROJECT_DIR_HISTORY);
      
      (async () => {
        try {
          await repository.saveCachedState(
            "global", 
            PROJECT_DIR_HISTORY_CACHE_KEY,
            JSON.stringify(limitedHistory)
          );
        } catch (e) {
          console.error("Failed to save project directory history to database:", e);
        }
      })();
      
      return limitedHistory;
    });
  }, [repository]); // Keep repository dependency

  // Handle input change directly updating local state
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setValidationStatus(null);
  }; // Clears validation status on manual input change

  // Validate the directory path using only server actions
  const validateDirectory = useCallback(async (directoryPath: string): Promise<boolean> => {
    setValidationStatus(null);
    const trimmedPath = directoryPath?.trim();
    if (!trimmedPath) {
      setValidationStatus({
        type: ValidationType.Error,
        message: "Please enter a directory path"
      });
      return false;
    }
    
    setIsValidating(true);
    setValidationStatus({ type: ValidationType.Loading, message: "Checking directory..." });
    try {
      const result = await validateDirectoryAction(trimmedPath, true); // Always use server action
      const isValid = result.isSuccess && result.data?.isAccessible;
      let message = result.message || (isValid ? "Directory is valid" : "Invalid directory");
      let validationType = isValid ? ValidationType.Success : ValidationType.Error;

      if (result.isSuccess && result.data?.stats) {
        const stats = result.data.stats;
        if (!stats.isGitRepository) {
          validationType = ValidationType.Error;
          message = "Not a Git repository. Please select a valid Git repository.";
        } else if (stats.fileCount !== undefined) { // Use fileCount to confirm git check ran
          message = "Git repository detected";
        } else {
          // Could be an empty repo, which is fine
          message = "Git repository detected (potentially empty)";
        }
      } else if (!result.isSuccess) {
        setValidationStatus({
          type: ValidationType.Error,
          message: result.message || "Directory validation failed"
        });
        return false;
      }
      
      if (isValid && result.data?.stats) {
        const stats = result.data.stats;
        if (stats.isEmpty) {
          validationType = ValidationType.Error;
          message = "Directory is an empty Git repository.";
          return false;
        } else if (!stats.isGitRepository) {
          validationType = ValidationType.Error;
          message = "Not a Git repository. Please select a valid Git repository.";
          return false;
        }
        
        if (stats.fileCount) {
          message = "Git repository detected";
        }
      }
      
      const finalValidationPassed = validationType === ValidationType.Success;
      setValidationStatus({
        type: validationType,
        message
      });

      return finalValidationPassed;
    } catch (error) {
      console.error("Error validating directory:", error);
      setValidationStatus({
        type: ValidationType.Error,
        message: error instanceof Error ? error.message : "Failed to validate directory"
      });
      return false; // Explicitly return false on error
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Handle selection from datalist or pressing Enter
  const handleSelectOrEnter = useCallback(async (selectedValue: string) => {
    if (isValidating) return;
    const normalizedValue = normalizePath(selectedValue?.trim() || "");

    setInputValue(normalizedValue); // Update input immediately

    if (!normalizedValue) {
      setProjectDirectory(""); // Clear project directory if input is empty
      setValidationStatus(null);
      return;
    }

    const validationPassed = await validateDirectory(normalizedValue);

    if (validationPassed) {
      // Update context with the validated directory
      setProjectDirectory(normalizedValue);
      addToHistory(normalizedValue);
      setShowHistoryDropdown(false);
    }
  }, [isValidating, validateDirectory, setProjectDirectory, addToHistory]);

  // Handle keydown events (Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSelectOrEnter(inputValue);
    }
  };

  // Handle browse button click
  const handleBrowseClick = useCallback(() => {
    setIsDirectoryBrowserOpen(true);
  }, []);

  // Handle directory selection from the browser modal
  const handleDirectorySelect = useCallback((selectedPath: string) => {
    if (!selectedPath) {
      console.warn("[Selector] Directory browser returned empty path.");
      return;
    }
    const normalizedPath = normalizePath(selectedPath);
    if (!normalizedPath) {
      console.warn(`[Selector] Normalization failed for path: ${selectedPath}`);
      setValidationStatus({
        type: ValidationType.Error,
        message: "Selected path could not be normalized."
      });
      return;
    }
    setInputValue(normalizedPath); // Update input with normalized path
    handleSelectOrEnter(normalizedPath); // Validate and set normalized path
  }, [handleSelectOrEnter]);

  // Remove a directory from history
  const removeFromHistory = (dirToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!repository) return; // Guard against missing repository
    setHistory((prevHistory) => {
      const newHistory = prevHistory.filter(dir => dir !== dirToRemove);
      
      (async () => {
        if (!repository) return;
        try {
          await repository.saveCachedState(
            "global",
            PROJECT_DIR_HISTORY_CACHE_KEY,
            JSON.stringify(newHistory)
          );
        } catch (e) {
          console.error("Failed to save updated history to DB:", e);
        }
      })();
      
      return newHistory;
    });
  }; // Close removeFromHistory

  // Clear all history with confirmation
  const clearAllHistory = async () => {
    if (confirm("Are you sure you want to clear all directory history?")) {
      setHistory([]);
      if (repository) {
        try {
          await repository.saveCachedState(
            "global",
            PROJECT_DIR_HISTORY_CACHE_KEY,
            "[]"
          );
        } catch (e) {
          console.error("Failed to clear history in database:", e);
        }
      }
    }
  };

  // Manually trigger validation and refresh of the current directory
  const handleRefresh = useCallback(async () => {
    if (!projectDirectory || isValidating) return;

    setValidationStatus({ type: ValidationType.Loading, message: "Refreshing directory..." });
    console.log(`[Refresh] Refreshing directory: ${projectDirectory}`);
    
    try {
      const isValid = await validateDirectory(projectDirectory);
      if (!isValid) {
        setValidationStatus({ type: ValidationType.Error, message: validationStatus?.message || "Directory validation failed during refresh." });
      }
      // Only proceed if validation was successful
      if (isValid) {
        if (onRefresh) {
          await onRefresh(); // Let parent handle the refresh logic
          console.log(`[Refresh] Successfully refreshed directory: ${projectDirectory}`);
          // Parent should ideally handle the success message, but we can provide a fallback
          setValidationStatus({ type: ValidationType.Success, message: "Directory refreshed successfully." });
        } else {
          console.warn("[Refresh] No onRefresh callback provided to ProjectDirectorySelector.");
          // Force a context update to trigger potential downstream effects
          setProjectDirectory(projectDirectory);
          setValidationStatus({ type: ValidationType.Success, message: "Directory refreshed (no action)." });
        }
        // Clear the success message after a few seconds
        setTimeout(() => {
          setValidationStatus(prev => {
            // Only clear if it's still the success message
            return prev?.type === ValidationType.Success ? null : prev;
          });
        }, 3000);
      }
    } catch (error) {
      console.error("[Refresh] Error during refresh:", error);
      setValidationStatus({
        type: ValidationType.Error,
        message: error instanceof Error ? error.message : "An error occurred during refresh"
      }); // Handle validation errors too
    }
  }, [projectDirectory, isValidating, validateDirectory, onRefresh, setProjectDirectory]);

  // Add click outside listener to close history dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    } // Removed finally block as validateDirectory handles setIsValidating
  }, [projectDirectory, isValidating, validateDirectory, onRefresh, setProjectDirectory]);

  return (
    <div className="bg-card border rounded-lg p-4 shadow-sm space-y-4">
      <h3 className="font-semibold text-lg text-card-foreground flex items-center gap-2">
        <FolderOpen className="h-4 w-4" /> Project Directory
      </h3>
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1" ref={historyRef}> {/* Use ref for history dropdown */}
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => history.length > 0 && setShowHistoryDropdown(true)}
            placeholder="Enter directory path or click Browse"
            className={cn("w-full pr-10", 
              validationStatus?.type === ValidationType.Success ? "border-green-500 focus-visible:ring-green-500" : "",
              validationStatus?.type === ValidationType.Error ? "border-red-500 focus-visible:ring-red-500" : ""
            )}
            disabled={isValidating}
          />
          
          {inputValue && (
            <button
              type="button"
              onClick={async () => { // Make async to handle URL update
                setInputValue("");
                setValidationStatus(null);
                setProjectDirectory(""); // Clear project directory when input is cleared
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear input"
            >
              <XCircle className="h-4 w-4" />
            </button>
          )}
          
          {/* History Dropdown */}
          {showHistoryDropdown && history.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-md">
              <div className="max-h-60 overflow-auto">
                <div className="p-1 space-y-0.5">
                  {history.map((dir) => ( // Use unique key
                    <div
                      key={dir}
                      className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer text-sm"
                      onClick={() => handleSelectOrEnter(dir)}
                    >
                      <span className="truncate flex-1" title={dir}>{dir}</span>
                      <button
                        type="button"
                        onClick={(e) => removeFromHistory(dir, e)}
                        className="ml-2 text-muted-foreground hover:text-destructive"
                        title="Remove from history"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {history.length > 1 && (
                <div className="border-t p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllHistory} // Call clearAllHistory
                    className="w-full text-xs text-muted-foreground hover:text-destructive"
                  >
                    Clear History
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        
        <Button
          type="button"
          onClick={handleBrowseClick}
          variant="secondary"
          className="shrink-0"
          disabled={isValidating}
        >
          Browse
        </Button>

        {/* Add a refresh button next to browse if onRefresh is provided */}
        {!!onRefresh && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={isValidating || !!isRefreshing || !projectDirectory} // Disable if no project directory
            title="Refresh directory contents"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
      
      {/* Validation status */}
      {(isValidating || validationStatus) && (
        <div className={cn(
          "text-sm flex items-center gap-2 p-2 rounded border",
          isValidating ? "text-muted-foreground border-muted-foreground/30 bg-muted/20" : 
            validationStatus?.type === ValidationType.Success ? "text-green-600 border-green-500/30 bg-green-500/10" :
            validationStatus?.type === ValidationType.Error ? "text-red-600 border-red-500/30 bg-red-500/10" :
            validationStatus?.type === ValidationType.Info ? "text-blue-600 border-blue-500/30 bg-blue-500/10" :
            validationStatus?.type === ValidationType.Loading ? "text-muted-foreground border-muted-foreground/30 bg-muted/20" :
            "hidden" // Hide if null
        )}>
          {validationStatus?.type === ValidationType.Loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{validationStatus.message}</span>
            </>
          ) : validationStatus?.type === ValidationType.Success ? (
            <>
              <Check className="h-4 w-4" />
              <span>{validationStatus.message}</span>
            </>
          ) : validationStatus?.type === ValidationType.Error ? (
            <>
              <AlertCircle className="h-4 w-4" />
              <span>{validationStatus.message}</span>
            </>
          ) : null}
        </div>
      )}

      {/* NEW: Directory Browser Modal */}
      <DirectoryBrowser
        isOpen={isDirectoryBrowserOpen}
        onClose={() => setIsDirectoryBrowserOpen(false)}
        onSelect={handleDirectorySelect} // Keep onSelect handler
        initialPath={inputValue || undefined}
      />
    </div>
  );
}

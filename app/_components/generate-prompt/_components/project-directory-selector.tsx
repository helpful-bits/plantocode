"use client";

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { AlertCircle, Check, FolderOpen, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validateDirectoryAction } from "@/actions/validate-directory-action";
import { getDefaultPathForOS, normalizePath, getDirectoryName } from "@/lib/path-utils";
import { useDatabase } from "@/lib/contexts/database-context";
import { useProject } from "@/lib/contexts/project-context";
import { PROJECT_DIR_HISTORY_CACHE_KEY, MAX_PROJECT_DIR_HISTORY } from "@/lib/constants";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function ProjectDirectorySelector() {
  const { projectDirectory, setProjectDirectory } = useProject();
  const { repository } = useDatabase();
  const [history, setHistory] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState(projectDirectory || "");
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{ isValid: boolean; message: string } | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load history from database on mount or when repository is ready
  useLayoutEffect(() => {
    const loadHistory = async () => {
      if (!repository) return;
      try {
        const historyStr = await repository.getCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY);

        if (historyStr) {
          try {
            const parsedHistory = JSON.parse(historyStr);
            if (Array.isArray(parsedHistory) && parsedHistory.every(item => typeof item === 'string')) {
              setHistory(parsedHistory);
            } else {
              setHistory([]);
              await repository.saveCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY, "[]");
            }
          } catch (parseError) {
            console.error("Failed to parse history data:", parseError);
            setHistory([]);
            await repository.saveCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY, "[]");
          }
        }
      } catch (e) {
        console.error("Failed to load project directory history:", e);
        setHistory([]);
        
        try {
          await repository.saveCachedState("global", "global", PROJECT_DIR_HISTORY_CACHE_KEY, "[]");
        } catch (err) {
          console.error("Failed to initialize history data:", err);
        }
      }
    };
    
    loadHistory();
  }, [repository]);

  // Update input value when projectDirectory changes
  useEffect(() => {
    if (projectDirectory && projectDirectory !== inputValue) {
      setInputValue(projectDirectory);
    }
  }, [projectDirectory]);

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
    };
  }, []);

  // Add a directory to history
  const addToHistory = useCallback((dir: string) => {
    if (!dir?.trim()) return;

    setHistory((prevHistory) => {
      const newHistory = [dir, ...prevHistory.filter((item) => item !== dir)];
      const limitedHistory = newHistory.slice(0, MAX_PROJECT_DIR_HISTORY);
      
      (async () => {
        if (!repository) return;
        try {
          await repository.saveCachedState(
            "global",
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
  }, [repository]);

  // Handle input change directly updating local state
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    setValidationStatus(null);
  };

  // Validate the directory path
  const validateDirectory = useCallback(async (directoryPath: string): Promise<boolean> => {
    setValidationStatus(null);
    if (!directoryPath?.trim()) {
      setValidationStatus({
        isValid: false,
        message: "Please enter a directory path"
      });
      return false;
    }
    
    setIsValidating(true);
    setValidationStatus({
      isValid: false,
      message: "Checking directory..."
    });
    
    try {
      const result = await validateDirectoryAction(directoryPath);
      const isValid = result.isSuccess && result.data?.isAccessible;

      let message = result.message || (isValid ? "Directory is valid" : "Invalid directory");
      
      // Check specifically for git repository
      if (isValid && result.data?.stats) {
        const stats = result.data.stats;
        if (!stats.isGitRepository) {
          setValidationStatus({
            isValid: false,
            message: "Not a git repository. Please select a valid git repository."
          });
          return false;
        }
        
        message = "Git repository detected";
        if (stats.fileCount) {
          message += ` with ${stats.fileCount} files and ${stats.dirCount} folders`;
        }
      }
      
      setValidationStatus({
        isValid: !!isValid,
        message
      });

      return isValid;
    } catch (error) {
      console.error("Error validating directory:", error);
      setValidationStatus({
        isValid: false,
        message: error instanceof Error ? error.message : "Failed to validate directory"
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Handle selection from datalist or pressing Enter
  const handleSelectOrEnter = useCallback(async (selectedValue: string) => {
    if (isValidating) return;

    const trimmedValue = selectedValue.trim();
    setInputValue(trimmedValue);
    
    const isValid = await validateDirectory(trimmedValue);

    if (isValid) {
      setProjectDirectory(trimmedValue);
      addToHistory(trimmedValue);
      setShowHistoryDropdown(false);
    }
  }, [setProjectDirectory, addToHistory, validateDirectory, isValidating]);

  // Handle keydown events (Enter, Escape)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSelectOrEnter(inputValue);
    } else if (e.key === 'Escape') {
      setShowHistoryDropdown(false);
    }
  };

  // Handle browse button click with modern File System Access API
  const handleBrowseClick = useCallback(() => {
    if ('showDirectoryPicker' in window) {
      (async () => {
        try {
          const dirHandle = await window.showDirectoryPicker();
          
          // Use the DirectoryHandle to get relevant information
          if (dirHandle) {
            // We can't get the full path from the File System Access API for security reasons
            // Instead, we use the directory name and user's OS to make a best guess
            // This is an approximation that works better than previous approach
            const userName = (navigator as any)?.userAgent || '';
            const basePath = getDefaultPathForOS(userName);
            
            // Construct an approximate path based on OS and directory name
            let dirPath = '';
            
            if (navigator.platform.toUpperCase().includes('WIN')) {
              dirPath = `${basePath}${dirHandle.name}`;
            } else {
              dirPath = `${basePath}${dirHandle.name}`;
            }
            
            setInputValue(dirPath);
            handleSelectOrEnter(dirPath);
          }
        } catch (err) {
          console.error("Error selecting directory:", err);
          if (err instanceof Error && err.name !== 'AbortError') {
            setValidationStatus({
              isValid: false,
              message: `Failed to select directory: ${err.message}`
            });
          }
        }
      })();
    } else {
      // Fallback for browsers without File System Access API
      const defaultPath = getDefaultPathForOS();
      const userPath = prompt("Enter directory path:", defaultPath || "");
      
      if (userPath) {
        setInputValue(userPath);
        handleSelectOrEnter(userPath);
      }
    }
  }, [handleSelectOrEnter]);

  // Remove a directory from history
  const removeFromHistory = (dirToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setHistory((prevHistory) => {
      const newHistory = prevHistory.filter(dir => dir !== dirToRemove);
      
      (async () => {
        if (!repository) return;
        try {
          await repository.saveCachedState(
            "global",
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
  };

  // Clear all history with confirmation
  const clearAllHistory = async () => {
    if (confirm("Are you sure you want to clear all directory history?")) {
      setHistory([]);
      
      if (repository) {
        try {
          await repository.saveCachedState(
            "global",
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

  return (
    <div className="bg-card border rounded-lg p-4 shadow-sm space-y-4">
      <h3 className="font-semibold text-lg text-card-foreground flex items-center gap-2">
        <FolderOpen className="h-4 w-4" /> Project Directory
      </h3>
      
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1" ref={historyRef}>
          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => history.length > 0 && setShowHistoryDropdown(true)}
            placeholder="Enter directory path or click Browse"
            className={cn("w-full pr-10", 
              validationStatus?.isValid ? "border-green-500 focus-visible:ring-green-500" : "",
              validationStatus?.isValid === false && !isValidating ? "border-red-500 focus-visible:ring-red-500" : ""
            )}
            disabled={isValidating}
          />
          
          {inputValue && (
            <button
              type="button"
              onClick={() => {
                setInputValue("");
                setValidationStatus(null);
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              title="Clear input"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          
          {/* History Dropdown */}
          {showHistoryDropdown && history.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 border rounded-md bg-popover shadow-md">
              <ScrollArea className="max-h-60">
                <div className="p-1 space-y-0.5">
                  {history.map((dir) => (
                    <div
                      key={dir}
                      className="flex items-center justify-between p-2 hover:bg-muted rounded cursor-pointer text-sm"
                      onClick={() => handleSelectOrEnter(dir)}
                    >
                      <span className="truncate flex-1">{dir}</span>
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
              </ScrollArea>
              {history.length > 1 && (
                <div className="border-t p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllHistory}
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
      </div>
      
      {/* Validation status */}
      {(isValidating || validationStatus) && (
        <div className={cn(
          "text-sm flex items-center gap-2 p-2 rounded border",
          isValidating ? "text-muted-foreground border-muted-foreground/30 bg-muted/20" : 
            validationStatus?.isValid 
              ? "text-green-500 border-green-500/30 bg-green-500/10" 
              : "text-red-500 border-red-500/30 bg-red-500/10"
        )}>
          {isValidating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Validating directory...</span>
            </>
          ) : validationStatus?.isValid ? (
            <>
              <Check className="h-4 w-4" />
              <span>{validationStatus.message}</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4" />
              <span>{validationStatus?.message}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

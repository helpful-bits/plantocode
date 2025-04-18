"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AlertCircle, Check, FolderOpen, Loader2, RefreshCw, Trash2, X, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validateDirectoryAction } from "@/actions/validate-directory-action";
import { normalizePath } from "@/lib/path-utils";
import { useDatabase } from "@/lib/contexts/database-context";
import { useProject } from "@/lib/contexts/project-context";
import { useInitialization } from "@/lib/contexts/initialization-context";
import { PROJECT_DIR_HISTORY_CACHE_KEY, MAX_PROJECT_DIR_HISTORY } from "@/lib/constants";
import { cn } from "@/lib/utils";
import DirectoryBrowser from "./directory-browser";

enum ValidationType {
  Success = 'success',
  Error = 'error',
  Info = 'info',
  Loading = 'loading',
}

export default function ProjectDirectorySelector({ onRefresh, isRefreshing }: { onRefresh?: () => Promise<void>, isRefreshing?: boolean }) {
  // Project context for backward compatibility
  const { projectDirectory: projectContextDir, setProjectDirectory: setProjectContextDir } = useProject();
  
  // Initialization context for reliable project handling
  const { 
    projectDirectory: initProjectDir, 
    setProjectDirectory: setInitProjectDir,
    isLoading: initIsLoading,
    stage: initStage
  } = useInitialization();
  
  // Database access for history
  const { repository, isInitialized: dbInitialized } = useDatabase();
  
  // Local component state
  const [history, setHistory] = useState<string[]>([]);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{ type: ValidationType; message: string } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isDirectoryBrowserOpen, setIsDirectoryBrowserOpen] = useState(false);
  
  // Refs
  const historyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitialMountRef = useRef(true);
  
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
        console.error("[ProjectDirSelector] Failed to load project directory history:", e);
        setHistory([]);
        
        try {
          await repository.saveCachedState("global", PROJECT_DIR_HISTORY_CACHE_KEY, "[]");
        } catch (err) {
          console.error("[ProjectDirSelector] Failed to initialize history data:", err);
        }
      }
    };
    loadHistory();
  }, [repository, dbInitialized]);

  // Update input field from initialization context
  useEffect(() => {
    if (initIsLoading && initStage !== 'ready') return;
    
    // Only update input if it differs from the normalized project directory
    const normalizedContextDir = normalizePath(initProjectDir || "");
    const normalizedInputValue = normalizePath(inputValue);
    
    if (normalizedContextDir !== normalizedInputValue) {
      console.log(`[ProjectDirSelector] Updating input from context: ${normalizedContextDir}`);
      setInputValue(initProjectDir || "");
    }
    
    // Clear initial mount flag after first sync
    isInitialMountRef.current = false;
  }, [initProjectDir, initIsLoading, initStage, inputValue]);

  // Add a directory to history
  const addToHistory = useCallback((dir: string) => {
    const normalizedDir = normalizePath(dir?.trim() || "");
    if (!normalizedDir || !repository) return;

    setHistory((prevHistory) => {
      // Add to front, remove duplicates, and limit size
      const newHistory = [normalizedDir, ...prevHistory.filter(item => 
        normalizePath(item) !== normalizedDir
      )].slice(0, MAX_PROJECT_DIR_HISTORY);
      
      // Save to database in background
      (async () => {
        try {
          await repository.saveCachedState(
            "global", 
            PROJECT_DIR_HISTORY_CACHE_KEY,
            JSON.stringify(newHistory)
          );
        } catch (e) {
          console.error("[ProjectDirSelector] Failed to save history:", e);
        }
      })();
      
      return newHistory;
    });
  }, [repository]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Reset validation status when input changes
    if (validationStatus) {
      setValidationStatus(null);
    }
  };

  // Validate directory with server action
  const validateDirectory = async (path: string): Promise<boolean> => {
    if (!path.trim()) {
      setValidationStatus({
        type: ValidationType.Error,
        message: "Please enter a directory path"
      });
      return false;
    }
    
    setIsValidating(true);
    setValidationStatus({
      type: ValidationType.Loading,
      message: "Validating directory..."
    });
    
    try {
      const result = await validateDirectoryAction(path);
      
      if (result.isSuccess) {
        setValidationStatus({
          type: ValidationType.Success,
          message: "Directory is valid"
        });
        return true;
      } else {
        setValidationStatus({
          type: ValidationType.Error,
          message: result.message || "Invalid directory"
        });
        return false;
      }
    } catch (err) {
      setValidationStatus({
        type: ValidationType.Error,
        message: err instanceof Error ? err.message : "Failed to validate directory"
      });
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  // Handle submit (when Enter is pressed)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Set Project button clicked");
    
    const normalizedInput = normalizePath(inputValue.trim());
    const normalizedProjectDir = normalizePath(initProjectDir || "");
    
    // Skip if unchanged
    if (normalizedInput === normalizedProjectDir) {
      return;
    }
    
    // Validate directory
    const isValid = await validateDirectory(normalizedInput);
    if (isValid) {
      // Add to history
      addToHistory(normalizedInput);
      
      // Force a URL update by directly navigating to the URL with the new project
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("projectDir", encodeURIComponent(normalizedInput));
      
      // Use window.location to force a complete reload with the new project
      window.location.href = currentUrl.toString();
    }
  };

  // Handle clear button click
  const handleClearClick = () => {
    setInputValue("");
    setValidationStatus(null);
    inputRef.current?.focus();
  };

  // Handle selecting from history
  const handleSelectHistory = (dir: string) => {
    setInputValue(dir);
    setShowHistoryDropdown(false);
    
    // Immediately validate and set project
    validateDirectory(dir).then(isValid => {
      if (isValid) {
        // Add to history first (to ensure it's at the top)
        addToHistory(dir);
        
        // Force a URL update by directly navigating to the URL with the new project
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("projectDir", encodeURIComponent(dir));
        
        // Use window.location to force a complete reload with the new project
        window.location.href = currentUrl.toString();
      }
    });
  };

  // Handle deleting from history
  const handleDeleteFromHistory = useCallback((e: React.MouseEvent, dirToDelete: string) => {
    e.stopPropagation();
    
    setHistory(prevHistory => {
      const newHistory = prevHistory.filter(dir => dir !== dirToDelete);
      
      // Save to database in background
      if (repository) {
        (async () => {
          try {
            await repository.saveCachedState(
              "global", 
              PROJECT_DIR_HISTORY_CACHE_KEY,
              JSON.stringify(newHistory)
            );
          } catch (e) {
            console.error("[ProjectDirSelector] Failed to save updated history:", e);
          }
        })();
      }
      
      return newHistory;
    });
  }, [repository, setInitProjectDir, setProjectContextDir]);

  // Handle click outside history dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [historyRef]);

  // Handle directory browser
  const handleOpenDirectoryBrowser = () => {
    setIsDirectoryBrowserOpen(true);
  };

  const handleDirectorySelected = (selectedPath: string) => {
    setInputValue(selectedPath);
    setIsDirectoryBrowserOpen(false);
    
    // Automatically validate selected directory
    validateDirectory(selectedPath).then(isValid => {
      if (isValid) {
        addToHistory(selectedPath);
        
        // Force a URL update by directly navigating to the URL with the new project
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("projectDir", encodeURIComponent(selectedPath));
        
        // Use window.location to force a complete reload with the new project
        window.location.href = currentUrl.toString();
      }
    });
  };

  // Display validation message
  const renderValidationIcon = () => {
    if (!validationStatus) return null;
    
    switch (validationStatus.type) {
      case ValidationType.Success:
        return <Check className="h-4 w-4 text-green-500" />;
      case ValidationType.Error:
        return <XCircle className="h-4 w-4 text-red-500" />;
      case ValidationType.Info:
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case ValidationType.Loading:
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }
  };

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
        <div className="relative flex-1">
          <div className="relative">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Enter project directory path"
              value={inputValue}
              onChange={handleInputChange}
              onClick={() => history.length > 0 && setShowHistoryDropdown(true)}
              className={cn(
                "pr-20", // Make room for buttons
                validationStatus?.type === ValidationType.Error && "border-red-500 focus-visible:ring-red-500",
                validationStatus?.type === ValidationType.Success && "border-green-500 focus-visible:ring-green-500",
              )}
              disabled={isValidating || initIsLoading}
            />
            
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
              {inputValue && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6" 
                  onClick={handleClearClick}
                  disabled={isValidating || initIsLoading}
                  title="Clear input"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button 
                type="button" 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6" 
                onClick={handleOpenDirectoryBrowser}
                disabled={isValidating || initIsLoading}
                title="Browse directories"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* History dropdown */}
          {showHistoryDropdown && history.length > 0 && (
            <div 
              ref={historyRef}
              className="absolute top-full left-0 right-0 z-10 mt-1 bg-popover shadow-md rounded-md border border-border max-h-40 overflow-auto"
            >
              <div className="p-1 space-y-1">
                {history.map((dir, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-2 text-sm hover:bg-accent rounded cursor-pointer truncate"
                    onClick={() => handleSelectHistory(dir)}
                    title={dir}
                  >
                    <span className="truncate flex-1 pr-2">{dir}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDeleteFromHistory(e, dir)}
                      title="Remove from history"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Validation message */}
          {validationStatus && (
            <div className={cn(
              "text-xs mt-1 flex items-center",
              validationStatus.type === ValidationType.Success && "text-green-500",
              validationStatus.type === ValidationType.Error && "text-red-500",
              validationStatus.type === ValidationType.Info && "text-blue-500",
              validationStatus.type === ValidationType.Loading && "text-muted-foreground"
            )}>
              <span className="mr-1">{renderValidationIcon()}</span>
              {validationStatus.message}
            </div>
          )}
        </div>
        
        {onRefresh && (
          <Button 
            type="button" 
            variant="outline" 
            className="flex-shrink-0"
            onClick={() => onRefresh?.()}
            disabled={isRefreshing || isValidating || !initProjectDir}
            title="Refresh project files"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        )}
        
        <Button 
          type="submit" 
          disabled={isValidating || initIsLoading || !inputValue.trim()}
          title="Set this directory as the current project"
          className="flex-shrink-0"
        >
          Set Project
        </Button>
      </form>
      
      {/* Directory browser dialog */}
      {isDirectoryBrowserOpen && (
        <DirectoryBrowser
          onClose={() => setIsDirectoryBrowserOpen(false)}
          onSelect={handleDirectorySelected}
          initialPath={inputValue || undefined}
        />
      )}
    </div>
  );
}

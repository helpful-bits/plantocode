"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PROJECT_DIR_HISTORY_KEY, MAX_PROJECT_DIR_HISTORY } from "@/lib/constants";
import { Trash2, FolderOpen, X, Check, AlertCircle } from "lucide-react";
import { validateDirectoryAction } from "@/actions/validate-directory-action";
import { useProject } from "@/lib/contexts/project-context";
import { getDefaultPathForOS, normalizePath, getDirectoryName } from "@/lib/path-utils";

interface ProjectDirectorySelectorProps {
  value: string;
  onChange: (value: string) => void; // Called when directory is selected/entered
  isLoadingFiles: boolean;
}

export default function ProjectDirectorySelector({
  value,
  onChange,
  isLoadingFiles,
}: ProjectDirectorySelectorProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState(value);
  const [showHistory, setShowHistory] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{ isValid: boolean; message?: string } | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  
  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(PROJECT_DIR_HISTORY_KEY);
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load project directory history:", e);
      localStorage.removeItem(PROJECT_DIR_HISTORY_KEY); // Clear corrupted data
    }
  }, []);

  // Update input value when the external value changes (e.g., loaded from context)
  useEffect(() => {
    setInputValue(value);
    
    // Reset validation status when value changes externally
    if (value !== inputValue) {
      setValidationStatus(null);
    }
  }, [value, inputValue]);

  // Add click outside listener to close history dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Add a directory to history
  const addToHistory = useCallback((dir: string) => {
    if (!dir?.trim()) return; // Don't add empty strings

    setHistory((prevHistory) => {
      const newHistory = [dir, ...prevHistory.filter((item) => item !== dir)];
      const limitedHistory = newHistory.slice(0, MAX_PROJECT_DIR_HISTORY);
      try {
        localStorage.setItem(PROJECT_DIR_HISTORY_KEY, JSON.stringify(limitedHistory));
      } catch (e) {
        console.error("Failed to save project directory history:", e);
      }
      return limitedHistory;
    });
  }, []);

  // Handle input change directly updating local state
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    // Clear validation status when input changes
    setValidationStatus(null);
  };

  // Validate the directory path
  const validateDirectory = async (directoryPath: string) => {
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
      
      const isValid = result.isSuccess;
      
      // We can provide more detailed feedback to the user
      let message = result.message || (isValid ? "Directory is valid" : "Invalid directory");
      
      // Add stats info if available
      if (isValid && result.data?.stats) {
        const stats = result.data.stats;
        if (stats.isGitRepository) {
          message += " (Git repository)";
        }
        if (stats.isEmpty) {
          message += " - Warning: Directory is empty";
        } else if (stats.fileCount) {
          message += ` - Contains ${stats.fileCount} files/folders`;
        }
      }
      
      setValidationStatus({
        isValid,
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
  };

  // Handle selection from datalist or pressing Enter
  const handleSelectOrEnter = async (selectedValue: string) => {
    const trimmedValue = selectedValue.trim();
    if (!trimmedValue) return;
    
    setInputValue(trimmedValue); // Update display immediately
    
    // Validate directory before propagating change
    const isValid = await validateDirectory(trimmedValue);
    
    if (isValid) {
      onChange(trimmedValue); // Propagate change up only if valid
      addToHistory(trimmedValue); // Add to history on selection/enter
      setShowHistory(false); // Hide history after selection
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSelectOrEnter(inputValue);
    }
  };

  const handleDatalistSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSelectOrEnter(e.target.value);
  };

  const handleBrowseClick = () => {
    // For the browser environment, we need to use a different approach
    // since direct file system access is limited
    
    // First check which approach to use based on available APIs
    if ('showDirectoryPicker' in window) {
      handleBrowseUsingFileSystemAPI();
    } else {
      fallbackDirectoryPrompt();
    }
  };
  
  // Modern approach using the File System Access API
  const handleBrowseUsingFileSystemAPI = () => {
    try {
      // Use the modern File System Access API
      // @ts-ignore - TypeScript may not recognize this API yet
      window.showDirectoryPicker()
        .then(async (dirHandle) => {
          try {
            // Get the directory path name 
            const dirName = dirHandle.name;
            
            // Prepare a reasonable default path
            let defaultPath = '';
            
            // If we already have a path, try to substitute just the last part
            if (inputValue.trim()) {
              const lastSlash = Math.max(
                inputValue.lastIndexOf('/'), 
                inputValue.lastIndexOf('\\')
              );
              
              if (lastSlash > 0) {
                // Replace just the directory name at the end
                defaultPath = inputValue.substring(0, lastSlash + 1) + dirName;
              } else {
                // No slashes, replace the entire path
                defaultPath = getDefaultPathForOS(dirName);
              }
            } else {
              // No existing path, use OS-specific default
              defaultPath = getDefaultPathForOS(dirName);
            }
            
            // Let the user confirm/edit the full path
            const userPath = window.prompt(
              "Please confirm the full path to the project directory:",
              defaultPath
            );
            
            if (userPath) {
              handleSelectOrEnter(userPath);
            }
          } catch (e) {
            console.error("Error handling directory selection:", e);
          }
        })
        .catch(err => {
          // User likely canceled or permission denied
          console.log("Directory selection was canceled or permission denied:", err);
        });
    } catch (e) {
      console.error("Error with directory picker:", e);
      fallbackDirectoryPrompt();
    }
  };
  
  // Fallback method using prompt
  const fallbackDirectoryPrompt = () => {
    // Try to determine a reasonable default path
    let defaultPath = inputValue || getDefaultPathForOS();
    
    // Show prompt with current value or OS-specific default
    const userPath = window.prompt(
      "Please enter the full path to your project directory:",
      defaultPath
    );
    
    if (userPath) {
      handleSelectOrEnter(userPath);
    }
  };

  const removeFromHistory = (dirToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the directory when clicking delete
    
    setHistory((prevHistory) => {
      const newHistory = prevHistory.filter(dir => dir !== dirToRemove);
      try {
        localStorage.setItem(PROJECT_DIR_HISTORY_KEY, JSON.stringify(newHistory));
      } catch (e) {
        console.error("Failed to save updated project directory history:", e);
      }
      return newHistory;
    });
  };

  const clearAllHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(PROJECT_DIR_HISTORY_KEY);
    } catch (e) {
      console.error("Failed to clear project directory history:", e);
    }
    setShowHistory(false);
  };

  return (
    <div className="relative w-full">
      <div className="flex flex-col gap-2 w-full">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Enter or select project directory..."
              className={`h-10 bg-background pr-9 ${
                validationStatus 
                  ? validationStatus.isValid 
                    ? "border-green-500 focus-visible:ring-green-500" 
                    : "border-red-500 focus-visible:ring-red-500"
                  : ""
              }`}
              disabled={isLoadingFiles || isValidating}
              onFocus={() => history.length > 0 && setShowHistory(true)}
            />
            {inputValue && (
              <button 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                onClick={() => {
                  setInputValue('');
                  onChange('');
                  setValidationStatus(null);
                }}
                disabled={isLoadingFiles || isValidating}
              >
                <X size={16} />
              </button>
            )}
          </div>
          
          <Button
            type="button"
            variant="outline"
            className="h-10 px-3 flex gap-1 items-center whitespace-nowrap"
            onClick={handleBrowseClick}
            disabled={isLoadingFiles || isValidating}
          >
            <FolderOpen size={16} />
            Browse
          </Button>
          
          <Button
            type="button"
            variant="outline"
            className="h-10 px-3"
            onClick={() => validateDirectory(inputValue)}
            disabled={isLoadingFiles || isValidating || !inputValue}
          >
            {isValidating ? "Checking..." : "Verify"}
          </Button>
        </div>
        
        {/* Validation status */}
        {(validationStatus || isValidating) && (
          <div className={`text-sm mt-1 flex items-center gap-1 ${
            isValidating 
              ? "text-blue-600"
              : (validationStatus?.isValid 
                ? "text-green-600" 
                : "text-red-600")
          }`}>
            {isValidating ? (
              <>
                <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse"></div>
                <span>Checking directory...</span>
              </>
            ) : validationStatus?.isValid ? (
              <>
                <Check size={14} className="inline" />
                {validationStatus.message}
              </>
            ) : (
              <>
                <AlertCircle size={14} className="inline" />
                {validationStatus?.message}
              </>
            )}
          </div>
        )}
      </div>
      
      {/* History dropdown */}
      {showHistory && history.length > 0 && (
        <div 
          ref={historyRef}
          className="absolute z-10 mt-1 w-full bg-popover shadow-md rounded-md border border-border overflow-hidden"
        >
          <div className="p-2 flex justify-between items-center border-b border-border">
            <span className="text-sm font-medium">Recent Directories</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearAllHistory}
              className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Clear All
            </Button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {history.map((dir) => (
              <div 
                key={dir} 
                className="flex items-center justify-between p-2 hover:bg-accent cursor-pointer border-b border-border last:border-b-0"
                onClick={() => handleSelectOrEnter(dir)}
              >
                <span className="text-sm truncate flex-1 mr-2">{dir}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={(e) => removeFromHistory(dir, e)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

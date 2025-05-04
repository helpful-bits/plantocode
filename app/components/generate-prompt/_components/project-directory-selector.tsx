"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AlertCircle, Check, FolderOpen, Loader2, X, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validateDirectoryAction } from "@/actions/validate-directory-action";
import { normalizePath } from "@/lib/path-utils";
import { useProject } from "@/lib/contexts/project-context";
import { cn } from "@/lib/utils";
import DirectoryBrowser from "./directory-browser";
import { useNotification } from "@/lib/contexts/notification-context";

enum ValidationType {
  Success = 'success',
  Error = 'error',
  Info = 'info',
  Loading = 'loading',
}

export default function ProjectDirectorySelector({ isRefreshing }: { isRefreshing?: boolean }) {
  // Project context for project directory management
  const { projectDirectory, setProjectDirectory, isLoading: projectIsLoading } = useProject();
  
  // Notification context for user feedback
  const { showNotification } = useNotification();
  
  // Local component state
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{ type: ValidationType; message: string } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isDirectoryBrowserOpen, setIsDirectoryBrowserOpen] = useState(false);
  
  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitialMountRef = useRef(true);
  
  // Update input field from project context
  useEffect(() => {
    if (projectIsLoading) return;
    
    // Only update input if it differs from the normalized project directory
    const normalizedContextDir = normalizePath(projectDirectory || "");
    const normalizedInputValue = normalizePath(inputValue);
    
    if (normalizedContextDir !== normalizedInputValue) {
      console.log(`[ProjectDirSelector] Updating input from context: ${normalizedContextDir}`);
      setInputValue(projectDirectory || "");
    }
    
    // Clear initial mount flag after first sync
    isInitialMountRef.current = false;
  }, [projectDirectory, projectIsLoading, inputValue]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Reset validation status when input changes
    if (validationStatus) {
      setValidationStatus(null);
    }
  };

  // Handle input keydown events
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If Enter key is pressed, submit the form
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e);
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
    console.log("[ProjectDirSelector] Form submitted");
    
    const normalizedInput = normalizePath(inputValue.trim());
    const normalizedProjectDir = normalizePath(projectDirectory || "");
    
    // Skip if unchanged
    if (normalizedInput === normalizedProjectDir) {
      console.log("[ProjectDirSelector] Project directory unchanged, skipping");
      return;
    }
    
    // Validate directory
    const isValid = await validateDirectory(normalizedInput);
    
    if (isValid) {
      try {
        // Update project directory using context
        await setProjectDirectory(normalizedInput);
        
        // Show success notification
        showNotification({
          title: "Project Updated",
          message: "Project directory has been set successfully.",
          type: "success"
        });
      } catch (error) {
        console.error("[ProjectDirSelector] Error setting project directory:", error);
        
        showNotification({
          title: "Error",
          message: error instanceof Error ? error.message : "Failed to set project directory",
          type: "error"
        });
      }
    }
  };

  // Handle clear button click
  const handleClearClick = () => {
    setInputValue("");
    setValidationStatus(null);
    inputRef.current?.focus();
  };

  // Open directory browser
  const handleOpenDirectoryBrowser = () => {
    setIsDirectoryBrowserOpen(true);
  };

  // Handle selection from directory browser
  const handleDirectorySelected = async (selectedPath: string) => {
    setIsDirectoryBrowserOpen(false);
    
    if (!selectedPath) return;
    
    const normalizedSelected = normalizePath(selectedPath);
    const normalizedProjectDir = normalizePath(projectDirectory || "");
    
    // Skip if unchanged
    if (normalizedSelected === normalizedProjectDir) {
      return;
    }
    
    // Set the input value
    setInputValue(selectedPath);
    
    // Validate and set if valid
    const isValid = await validateDirectory(selectedPath);
    
    if (isValid) {
      try {
        // Update project directory using context
        await setProjectDirectory(selectedPath);
        
        // Show success notification
        showNotification({
          title: "Project Updated",
          message: "Project directory has been set from browser.",
          type: "success"
        });
      } catch (error) {
        console.error("[ProjectDirSelector] Error setting project directory from browser:", error);
        
        showNotification({
          title: "Error",
          message: error instanceof Error ? error.message : "Failed to set project directory from browser",
          type: "error"
        });
      }
    }
  };

  // Render validation icon
  const renderValidationIcon = () => {
    if (!validationStatus) return null;
    
    switch (validationStatus.type) {
      case ValidationType.Loading:
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case ValidationType.Success:
        return <Check className="h-4 w-4 text-green-500" />;
      case ValidationType.Error:
        return <XCircle className="h-4 w-4 text-destructive" />;
      case ValidationType.Info:
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex flex-col space-y-2 w-full">
          <div className="text-sm text-muted-foreground mb-1">
            Select your project&apos;s root folder to enable file browsing, session saving, and project-specific settings.
          </div>
          <div className="flex items-center space-x-2 w-full">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder="Enter project directory path"
                className={cn(
                  "pr-10",
                  validationStatus?.type === ValidationType.Error && "border-destructive focus-visible:ring-destructive",
                  validationStatus?.type === ValidationType.Success && "border-green-500 focus-visible:ring-green-500"
                )}
                disabled={isValidating}
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={handleClearClick}
                  className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {renderValidationIcon()}
              </div>
            </div>

            <Button 
              type="button"
              variant="outline"
              size="icon"
              onClick={handleOpenDirectoryBrowser}
              disabled={isValidating}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>

          {validationStatus && (
            <p className={cn(
              "text-xs px-2",
              validationStatus.type === ValidationType.Error && "text-destructive",
              validationStatus.type === ValidationType.Success && "text-green-500",
              validationStatus.type === ValidationType.Info && "text-blue-500",
              validationStatus.type === ValidationType.Loading && "text-muted-foreground"
            )}>
              {validationStatus.message}
            </p>
          )}

          <div className="text-xs text-muted-foreground mt-1 px-2">
            This sets the context for file browsing and session management.
          </div>
        </div>
      </form>

      {/* Directory browser */}
      <DirectoryBrowser
        onClose={() => setIsDirectoryBrowserOpen(false)}
        onSelect={handleDirectorySelected}
        initialPath={inputValue || projectDirectory || ""}
        isOpen={isDirectoryBrowserOpen}
      />
    </div>
  );
}

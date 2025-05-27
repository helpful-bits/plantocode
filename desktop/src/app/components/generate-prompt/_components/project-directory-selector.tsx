"use client";

import {
  AlertCircle,
  Check,
  FolderOpen,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import { validateDirectoryAction } from "@/actions/file-system/validation.actions";
import { getHomeDirectoryAction } from "@/actions";
import { useNotification } from "@/contexts/notification-context";
import { useProject } from "@/contexts/project-context";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { normalizePath } from "@/utils/path-utils";
import { cn } from "@/utils/utils";


enum ValidationType {
  Success = "success",
  Error = "error",
  Info = "info",
  Loading = "loading",
}

function ProjectDirectorySelector({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  // Project context for project directory management
  const {
    projectDirectory,
    setProjectDirectory,
    isLoading: projectIsLoading,
  } = useProject();

  // Notification context for user feedback
  const { showNotification } = useNotification();

  // Local component state
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<{
    type: ValidationType;
    message: string;
  } | null>(null);
  const [inputValue, setInputValue] = useState("");

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitialMountRef = useRef(true);
  const userEditedRef = useRef(false);

  // Update input field from project context on initial mount or when project directory changes
  useEffect(() => {
    if (projectIsLoading) return;

    const contextProjectDir = projectDirectory || "";
    
    // On initial mount, always sync with project directory regardless of user edits
    if (isInitialMountRef.current) {
      if (projectDirectory) {
        setInputValue(projectDirectory);
      }
      isInitialMountRef.current = false;
      return;
    }

    // After initial mount, only update if user hasn't edited
    if (!userEditedRef.current) {
      // Use async comparison for proper path normalization
      const compareAndUpdate = async () => {
        const normalizedInputValue = await normalizePath(inputValue);
        const normalizedContextDir = await normalizePath(contextProjectDir);

        if (normalizedInputValue !== normalizedContextDir) {
          setInputValue(contextProjectDir);
        }
      };

      void compareAndUpdate();
    }
  }, [projectDirectory, projectIsLoading]); // Removed inputValue from dependencies

  // Reset userEditedRef when input value matches project directory
  useEffect(() => {
    if (!projectIsLoading && projectDirectory) {
      // Check if input value and project directory are in sync
      const checkPaths = async () => {
        const normalizedInput = await normalizePath(inputValue);
        const normalizedProjectDir =
          await normalizePath(projectDirectory);

        if (normalizedInput === normalizedProjectDir && userEditedRef.current) {
          userEditedRef.current = false;
        }
      };

      void checkPaths();
    }
  }, [inputValue, projectDirectory, projectIsLoading]);

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    userEditedRef.current = true; // Mark as user-edited

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
      void handleSubmit(e);
    }
  };

  // Validate directory with server action
  const validateDirectory = useCallback(
    async (
      path: string
    ): Promise<{
      isValid: boolean;
      validatedPath?: string;
      message?: string;
    }> => {
      // Handle empty input
      if (!path.trim()) {
        setValidationStatus({
          type: ValidationType.Error,
          message: "Please enter a directory path",
        });
        return { isValid: false, message: "Please enter a directory path" };
      }

      // Update status to show loading state
      setIsValidating(true);
      setValidationStatus({
        type: ValidationType.Loading,
        message: "Validating directory...",
      });

      try {
        // Normalize the path before sending to the server
        const normalizedPath = await normalizePath(path);
        const result = await validateDirectoryAction(normalizedPath);

        if (result.isSuccess) {
          // Success - directory is valid
          setValidationStatus({
            type: ValidationType.Success,
            message: result.message || "Directory is valid",
          });

          // Use the validated path returned from server, or fall back to the input
          const validatedPath = result.data || normalizedPath;
          return {
            isValid: true,
            validatedPath,
            message: result.message,
          };
        } else {
          // Failure - directory is invalid
          setValidationStatus({
            type: ValidationType.Error,
            message: result.message || "Invalid directory",
          });
          return {
            isValid: false,
            message: result.message || "Invalid directory",
          };
        }
      } catch (err) {
        // Exception during validation
        const errorMessage =
          err instanceof Error ? err.message : "Failed to validate directory";

        setValidationStatus({
          type: ValidationType.Error,
          message: errorMessage,
        });

        return {
          isValid: false,
          message: errorMessage,
        };
      } finally {
        setIsValidating(false);
      }
    },
    []
  );

  // Handle submit (when Enter is pressed or form is submitted)
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Trim and normalize input for processing
      const trimmedInput = inputValue.trim();
      if (!trimmedInput) {
        setValidationStatus({
          type: ValidationType.Error,
          message: "Please enter a directory path",
        });
        return;
      }

      // Get properly normalized paths for comparison
      const normalizedInput = await normalizePath(trimmedInput);
      const normalizedProjectDir = await normalizePath(projectDirectory || "");

      // Skip if unchanged using proper path comparison
      if (normalizedInput === normalizedProjectDir) {
        setValidationStatus({
          type: ValidationType.Info,
          message: "Directory unchanged",
        });
        return;
      }

      // Validate directory
      const validationResult = await validateDirectory(normalizedInput);

      if (validationResult.isValid && validationResult.validatedPath) {
        try {
          // Update project directory using context with the validated path from server
          await setProjectDirectory(validationResult.validatedPath);

          // Also update the input field to show the canonical path
          setInputValue(validationResult.validatedPath);
          // userEditedRef will be reset by the useEffect when input and project directory are in sync

          // Show success notification
          showNotification({
            title: "Project Updated",
            message: "Project directory has been set successfully.",
            type: "success",
          });
        } catch (error) {
          console.error(
            "[ProjectDirSelector] Error setting project directory:",
            error
          );

          // Show error notification
          showNotification({
            title: "Error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to set project directory",
            type: "error",
          });

          // Update validation status to reflect the error
          setValidationStatus({
            type: ValidationType.Error,
            message:
              error instanceof Error
                ? error.message
                : "Failed to set project directory",
          });
        }
      }
    },
    [
      inputValue,
      projectDirectory,
      validateDirectory,
      setProjectDirectory,
      showNotification,
    ]
  );

  // Handle clear button click
  const handleClearClick = useCallback(() => {
    setInputValue("");
    setValidationStatus(null);
    userEditedRef.current = true; // Mark as user-edited
    inputRef.current?.focus();
  }, []);

  // Open native file dialog for directory selection
  const handleOpenDirectoryBrowser = useCallback(async () => {
    try {
      // Get default path - use current input value or home directory
      let defaultPath = inputValue.trim();
      if (!defaultPath) {
        const homeResult = await getHomeDirectoryAction();
        if (homeResult?.isSuccess && homeResult.data) {
          defaultPath = homeResult.data;
        }
      }

      // Open native directory picker
      const selectedPath = await open({
        directory: true,
        multiple: false,
        defaultPath: defaultPath || undefined,
      });

      // Handle selection
      if (selectedPath && typeof selectedPath === 'string') {
        // Update input value
        setInputValue(selectedPath);
        userEditedRef.current = true;

        // Validate and set if valid
        const validationResult = await validateDirectory(selectedPath);

        if (validationResult.isValid && validationResult.validatedPath) {
          try {
            // Update project directory using context with the validated path from server
            await setProjectDirectory(validationResult.validatedPath);
            // Also update the input field to show the canonical path
            setInputValue(validationResult.validatedPath);

            // Show success notification
            showNotification({
              title: "Project Updated",
              message: "Project directory has been set from browser.",
              type: "success",
            });
          } catch (error) {
            console.error(
              "[ProjectDirSelector] Error setting project directory from browser:",
              error
            );

            showNotification({
              title: "Error",
              message:
                error instanceof Error
                  ? error.message
                  : "Failed to set project directory from browser",
              type: "error",
            });
          }
        }
      }
    } catch (error) {
      console.error("[ProjectDirSelector] Error opening directory dialog:", error);
      showNotification({
        title: "Error",
        message: "Failed to open directory picker",
        type: "error",
      });
    }
  }, [inputValue, validateDirectory, setProjectDirectory, showNotification]);


  // Render validation icon
  const renderValidationIcon = useCallback(() => {
    if (!validationStatus) return null;

    switch (validationStatus.type) {
      case ValidationType.Loading:
        return (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        );
      case ValidationType.Success:
        return <Check className="h-4 w-4 text-green-500" />;
      case ValidationType.Error:
        return <XCircle className="h-4 w-4 text-destructive" />;
      case ValidationType.Info:
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  }, [validationStatus]);

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex flex-col space-y-2 w-full">
          <div className="flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder="Enter project directory path"
                className={cn(
                  "pr-10",
                  validationStatus?.type === ValidationType.Error &&
                    "border-destructive focus-visible:ring-destructive",
                  validationStatus?.type === ValidationType.Success &&
                    "border-green-500 focus-visible:ring-green-500",
                  disabled && "opacity-70"
                )}
                disabled={isValidating || disabled}
                aria-invalid={validationStatus?.type === ValidationType.Error}
                aria-describedby={
                  validationStatus ? "validation-message" : undefined
                }
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={handleClearClick}
                  className="absolute right-10 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-ring"
                  aria-label="Clear input"
                  disabled={disabled}
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
              disabled={isValidating || disabled}
              className={cn(
                "h-9 w-9 flex items-center justify-center",
                disabled && "opacity-70"
              )}
              aria-label="Browse directories"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>

          {validationStatus && (
            <p
              id="validation-message"
              className={cn(
                "text-xs px-1",
                validationStatus.type === ValidationType.Error &&
                  "text-destructive",
                validationStatus.type === ValidationType.Success &&
                  "text-green-500",
                validationStatus.type === ValidationType.Info &&
                  "text-blue-500",
                validationStatus.type === ValidationType.Loading &&
                  "text-muted-foreground"
              )}
            >
              {validationStatus.message}
            </p>
          )}

          <div className="text-xs text-muted-foreground mt-1 px-1 text-balance">
            Sets the root directory for file browsing, session storage, and
            project settings.
          </div>
        </div>
      </form>

    </div>
  );
}

ProjectDirectorySelector.displayName = "ProjectDirectorySelector";

export default ProjectDirectorySelector;

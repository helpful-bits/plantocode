"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, FolderPlus, X, Folder } from "lucide-react";
import { Button } from "@/ui/button";
import { cn } from "@/utils/utils";
import { useProject } from "@/contexts/project-context";
import { useNotification } from "@/contexts/notification-context";
import { open } from "@tauri-apps/plugin-dialog";

interface ExternalFoldersSettingsProps {
  className?: string;
}

export function ExternalFoldersSettings({ 
  className 
}: ExternalFoldersSettingsProps) {
  const { projectDirectory, externalFolders, setExternalFolders } = useProject();
  const { showNotification } = useNotification();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddFolder = useCallback(async () => {
    if (!projectDirectory) {
      showNotification({
        title: "No Project Selected",
        message: "Please select a project directory first",
        type: "error",
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // Open folder picker dialog
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: "Select External Folder",
      });

      if (selectedPath && typeof selectedPath === 'string') {
        // Check if folder is already added
        if (externalFolders.includes(selectedPath)) {
          showNotification({
            title: "Folder Already Added",
            message: "This folder is already in the external folders list",
            type: "info",
          });
          return;
        }

        // Check if it's the same as project directory
        if (selectedPath === projectDirectory) {
          showNotification({
            title: "Invalid Selection",
            message: "Cannot add the project directory as an external folder",
            type: "error",
          });
          return;
        }

        // Add the new folder
        const updatedFolders = [...externalFolders, selectedPath];
        await setExternalFolders(updatedFolders);
        
        showNotification({
          title: "Folder Added",
          message: "External folder added successfully",
          type: "success",
        });
      }
    } catch (error) {
      console.error("Failed to add external folder:", error);
      showNotification({
        title: "Failed to Add Folder",
        message: error instanceof Error ? error.message : "An error occurred",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory, externalFolders, setExternalFolders, showNotification]);

  const handleRemoveFolder = useCallback(async (folderPath: string) => {
    try {
      const updatedFolders = externalFolders.filter(f => f !== folderPath);
      await setExternalFolders(updatedFolders);
      
      showNotification({
        title: "Folder Removed",
        message: "External folder removed successfully",
        type: "success",
      });
    } catch (error) {
      console.error("Failed to remove external folder:", error);
      showNotification({
        title: "Failed to Remove Folder",
        message: error instanceof Error ? error.message : "An error occurred",
        type: "error",
      });
    }
  }, [externalFolders, setExternalFolders, showNotification]);

  const handleClearAll = useCallback(async () => {
    try {
      await setExternalFolders([]);
      showNotification({
        title: "Folders Cleared",
        message: "All external folders removed",
        type: "success",
      });
    } catch (error) {
      console.error("Failed to clear external folders:", error);
      showNotification({
        title: "Failed to Clear Folders",
        message: error instanceof Error ? error.message : "An error occurred",
        type: "error",
      });
    }
  }, [setExternalFolders, showNotification]);

  // Don't render if no project directory
  if (!projectDirectory) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
          disabled={isLoading}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <FolderPlus className="h-4 w-4" />
          <span>External Folders</span>
          {externalFolders.length > 0 && (
            <span className="text-muted-foreground">
              ({externalFolders.length})
            </span>
          )}
        </button>
        
        {externalFolders.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
            disabled={isLoading}
            className="h-6 px-2 text-xs"
          >
            Clear All
          </Button>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="space-y-3 pl-6">
          {/* Add folder button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddFolder}
            disabled={isLoading}
            className="w-full"
          >
            <FolderPlus className="h-4 w-4 mr-2" />
            Add External Folder
          </Button>

          {/* External folders list */}
          {externalFolders.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto border border-border rounded-md p-2">
              {externalFolders.map((folder) => {
                const relativePath = projectDirectory 
                  ? folder.replace(projectDirectory, "").replace(/^\//, "") || folder
                  : folder;
                
                return (
                  <div
                    key={folder}
                    className="flex items-center justify-between gap-2 p-1.5 hover:bg-accent rounded-sm group"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground truncate" title={folder}>
                        {relativePath}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFolder(folder)}
                      className="h-6 w-6"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
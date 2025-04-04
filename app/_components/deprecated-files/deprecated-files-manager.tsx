"use client";

import { useState, useEffect, useCallback } from "react";
import { findDeprecatedFilesAction, deleteDeprecatedFileAction } from "@/actions/deprecated-actions";
import { DeprecatedFile } from "@/lib/find-deprecated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/lib/contexts/project-context";
import { hashString } from "@/lib/hash"; // Assuming hashString is exported from lib/hash

const DEPRECATED_SELECTED_KEY = "deprecated-selected-files";

// Helper to get namespaced localStorage key (similar to GeneratePromptForm)
const getLocalKey = (dir: string, suffix: string) => {
  const hash = hashString(dir);
  return `dfm-${hash}-${suffix}`; // Use a different prefix like 'dfm-'
};

export function DeprecatedFilesManager() {
  const { projectDirectory } = useProject();
  const [deprecatedFiles, setDeprecatedFiles] = useState<(DeprecatedFile & { selected: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Load selected state from localStorage when project directory changes
  useEffect(() => {
    if (projectDirectory) {
      const savedSelectedPaths = JSON.parse(localStorage.getItem(getLocalKey(projectDirectory, DEPRECATED_SELECTED_KEY)) || "[]");
      setDeprecatedFiles(prevFiles =>
        prevFiles.map(file => ({
          ...file,
          selected: savedSelectedPaths.includes(file.path)
        }))
      );
    } else {
      setDeprecatedFiles([]); // Clear if no project directory
    }
  }, [projectDirectory]);

  // Save selected state to localStorage whenever it changes
  useEffect(() => {
    if (projectDirectory) {
      const selectedPaths = deprecatedFiles
        .filter(file => file.selected)
        .map(file => file.path);
      localStorage.setItem(getLocalKey(projectDirectory, DEPRECATED_SELECTED_KEY), JSON.stringify(selectedPaths));
    }
  }, [deprecatedFiles, projectDirectory]);

  const handleFindDeprecated = async () => {
    if (!projectDirectory) {
      setError("Please set a project directory first");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      const result = await findDeprecatedFilesAction(projectDirectory);
      const savedSelectedPaths = JSON.parse(localStorage.getItem(getLocalKey(projectDirectory, DEPRECATED_SELECTED_KEY)) || "[]");

      if (result.isSuccess) {
        setDeprecatedFiles(result.data.map(file => ({
          ...file,
          selected: savedSelectedPaths.includes(file.path) // Load selection state
        })));
        if (result.data.length === 0) {
          setSuccessMessage("No deprecated files found");
        }
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError("Failed to find deprecated files");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (!projectDirectory) return;

    const selectedFiles = deprecatedFiles.filter(f => f.selected);
    if (selectedFiles.length === 0) {
      setError("No files selected");
      return;
    }

    setIsLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      let success = true;
      let deletedCount = 0;

      for (const file of selectedFiles) {
        const result = await deleteDeprecatedFileAction(projectDirectory, file.path);
        if (result.isSuccess) {
          deletedCount++;
        } else {
          success = false;
          setError(prev => prev ? `${prev}, ${result.message}` : result.message);
        }
      }

      if (success) {
        setSuccessMessage(`Successfully deleted ${deletedCount} file(s)`);
        setDeprecatedFiles(files => files.filter(f => !f.selected));
        localStorage.removeItem(getLocalKey(projectDirectory, DEPRECATED_SELECTED_KEY)); // Clear selection on success
      } else if (deletedCount > 0) {
        setSuccessMessage(`Partially successful: deleted ${deletedCount} file(s)`);
        // Re-filter to keep non-deleted selected files, potentially? Or just remove deleted ones.
        setDeprecatedFiles(files => files.filter(f => !selectedFiles.find(sf => sf.path === f.path && f.selected)));
      }
    } catch (error) {
      setError("Failed to delete selected files");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFile = (path: string) => {
    setDeprecatedFiles(files =>
      files.map(f =>
        f.path === path ? { ...f, selected: !f.selected } : f
      )
    );
  };

  // Select All functionality needs to consider the current filter
  const toggleAll = (selected: boolean) => {
    const filteredPaths = new Set(filteredFiles.map(f => f.path));
    setDeprecatedFiles(files =>
      files.map(f =>
        filteredPaths.has(f.path) ? { ...f, selected } : f // Only toggle visible/filtered files
      )
    );
  };

  const filteredFiles = deprecatedFiles.filter(file =>
    file.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Correctly count selected files among *all* files, not just filtered ones
  const totalSelectedCount = deprecatedFiles.filter(f => f.selected).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={handleFindDeprecated}
          disabled={isLoading || !projectDirectory}
        >
          {isLoading ? "Loading..." : "Find Deprecated Files"}
        </Button>
      </div>

      {error && <div className="text-destructive">{error}</div>}
      {successMessage && <div className="text-green-500 dark:text-green-400">{successMessage}</div>}

      {deprecatedFiles.length > 0 && (
        <div className="border rounded bg-background">
          <div className="p-4 border-b">
            <div className="flex items-center gap-4 mb-4">
              <Input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filteredFiles.length > 0 && filteredFiles.every(f => f.selected)}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4"
                />
                Select All (Filtered)
              </label>
            </div>
            <div className="text-sm text-muted-foreground">
              {totalSelectedCount} of {deprecatedFiles.length} files selected
            </div>
          </div>

          <ul className="divide-y">
            {filteredFiles.map((file) => (
              <li key={file.path} className="flex items-start gap-3 p-3 hover:bg-muted/50">
                <input
                  type="checkbox"
                  checked={file.selected}
                  onChange={() => toggleFile(file.path)}
                  className="mt-1 h-4 w-4"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm truncate">{file.path}</div>
                  {file.newLocation && (
                    <div className="text-sm text-muted-foreground truncate">
                      Moved to: {file.newLocation}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="p-4 border-t">
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleDeleteSelected}
              disabled={isLoading || totalSelectedCount === 0}
            >
              {isLoading ? "Deleting..." : `Delete Selected Files (${totalSelectedCount})`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 
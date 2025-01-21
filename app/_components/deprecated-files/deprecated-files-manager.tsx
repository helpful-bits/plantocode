"use client";

import { useState } from "react";
import { findDeprecatedFilesAction, deleteDeprecatedFileAction } from "@/actions/deprecated-actions";
import { DeprecatedFile } from "@/lib/find-deprecated";
import { Input } from "@/components/ui/input";

interface DeprecatedFilesManagerProps {
  projectDirectory: string;
}

export function DeprecatedFilesManager({ projectDirectory }: DeprecatedFilesManagerProps) {
  const [deprecatedFiles, setDeprecatedFiles] = useState<(DeprecatedFile & { selected: boolean })[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

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
      if (result.isSuccess) {
        setDeprecatedFiles(result.data.map(file => ({ ...file, selected: true })));
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
      } else if (deletedCount > 0) {
        setSuccessMessage(`Partially successful: deleted ${deletedCount} file(s)`);
        setDeprecatedFiles(files => files.filter(f => !f.selected));
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

  const toggleAll = (selected: boolean) => {
    setDeprecatedFiles(files =>
      files.map(f => ({ ...f, selected }))
    );
  };

  const filteredFiles = deprecatedFiles.filter(file =>
    file.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCount = deprecatedFiles.filter(f => f.selected).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          className="bg-secondary text-secondary-foreground p-2 rounded"
          onClick={handleFindDeprecated}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Find Deprecated Files"}
        </button>
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
                  checked={selectedCount === deprecatedFiles.length}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4"
                />
                Select All
              </label>
            </div>
            <div className="text-sm text-muted-foreground">
              {selectedCount} of {deprecatedFiles.length} files selected
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
            <button
              className="w-full bg-destructive text-destructive-foreground p-2 rounded disabled:opacity-50"
              onClick={handleDeleteSelected}
              disabled={isLoading || selectedCount === 0}
            >
              {isLoading ? "Deleting..." : `Delete Selected Files (${selectedCount})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 
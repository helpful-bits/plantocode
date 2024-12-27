"use client";

import { Input } from "@/components/ui/input";
import { Dispatch, SetStateAction } from "react";

interface FileInfo {
  path: string;
  size: number;
  included: boolean;
  forceExcluded: boolean;
}

interface FileBrowserProps {
  foundFiles: FileInfo[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  setFoundFiles: (files: FileInfo[]) => void;
}

export default function FileBrowser({
  foundFiles,
  searchTerm,
  onSearchChange,
  setFoundFiles
}: FileBrowserProps) {
  const files = Array.isArray(foundFiles) ? foundFiles : [];
  
  const filteredFiles = files.filter((file) =>
    file.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleFile = (path: string) => {
    setFoundFiles(
      files.map((f) =>
        f.path === path ? { ...f, included: !f.included } : f
      )
    );
  };

  const handleToggleForceExclude = (path: string) => {
    setFoundFiles(
      files.map((f) => {
        if (f.path === path) {
          const forceExcluded = !f.forceExcluded;
          return {
            ...f,
            forceExcluded,
            included: forceExcluded ? false : f.included,
          };
        }
        return f;
      })
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleBulkToggle = (include: boolean) => {
    setFoundFiles(
      files.map((f) =>
        filteredFiles.some((ff) => ff.path === f.path)
          ? { ...f, included: include && !f.forceExcluded }
          : f
      )
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 && (
        <>
          <label className="font-bold text-foreground">
            Found Files ({files.filter((f) => f.included).length}/{files.length}):
          </label>

          <div className="flex gap-2 items-center">
            <Input
              type="text"
              className="border rounded bg-background text-foreground p-2 flex-1"
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <button
              className="bg-secondary text-secondary-foreground p-2 rounded text-sm"
              onClick={() => handleBulkToggle(false)}
              disabled={filteredFiles.length === 0}
            >
              Exclude Filtered
            </button>
            <button
              className="bg-secondary text-secondary-foreground p-2 rounded text-sm"
              onClick={() => handleBulkToggle(true)}
              disabled={filteredFiles.length === 0}
            >
              Include Filtered
            </button>
          </div>

          <div className="border rounded bg-background p-2 max-h-48 overflow-y-auto">
            {filteredFiles.map((file, i) => (
              <div
                key={i}
                className={`flex items-center justify-between text-sm py-1 hover:bg-accent/50 ${
                  file.included ? "bg-accent" : ""
                } ${file.forceExcluded ? "opacity-50" : ""}`}
              >
                <label className="flex items-center gap-2 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={file.included}
                    disabled={file.forceExcluded}
                    onChange={() => handleToggleFile(file.path)}
                    className="cursor-pointer"
                  />
                  <input
                    type="checkbox"
                    checked={file.forceExcluded}
                    onChange={() => handleToggleForceExclude(file.path)}
                    className="cursor-pointer accent-destructive"
                    title="Force exclude"
                  />
                  <span className="font-mono flex-1">{file.path}</span>
                </label>
                <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
              </div>
            ))}
            {filteredFiles.length === 0 && searchTerm && (
              <div className="text-muted-foreground text-center py-2">
                No files match your search
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
} 
"use client";
import { Dispatch, SetStateAction, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import path from "path"; // Import path for checking absolute paths

interface PastePathsProps {
  pastedPaths: string;
  onChange: (value: string) => void;
  onInteraction: () => void; // Notify parent of interaction
  foundFiles: { path: string }[]; // Array of file objects with path property
  allFilesMap: { [path: string]: any }; // Use the map of all project files
  setPastedPathsFound: Dispatch<SetStateAction<number>>;
  pastedPathsFound: number;
}

export default function PastePaths({
  pastedPaths,
  onChange,
  onInteraction,
  foundFiles,
  allFilesMap,
  setPastedPathsFound,
  pastedPathsFound
}: PastePathsProps) {
  useEffect(() => {
    if (pastedPaths.trim()) { // Calculate whenever pastedPaths changes
      const lines = pastedPaths
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => !!l && !l.startsWith("#"));
      
      // Count files that exist in the project
      const available = Object.keys(allFilesMap);

      const matched = lines.filter((p) => available.includes(p)).length;
      
      // External paths are those that aren't in the project
      const externalPaths = lines.filter((p) => !available.includes(p));
      
      // Set the total number found (from project + external)
      // This count is slightly approximate as external paths haven't been read yet
      setPastedPathsFound(matched + externalPaths.length);
    }
  }, [pastedPaths, foundFiles, allFilesMap, setPastedPathsFound]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">
          Or Paste File Paths (one per line):
          <span className="text-sm font-normal text-muted-foreground ml-2">
            Supports project paths and external/absolute paths
          </span>
        </label>
        {pastedPaths.trim() && (
          <span className="text-sm font-medium bg-secondary text-secondary-foreground px-2 py-1 rounded">
            {pastedPathsFound} path(s) specified
          </span>
        )}
      </div>

      <Textarea
        className="border rounded bg-background text-foreground p-2 h-32 font-mono text-sm"
        value={pastedPaths}
        onChange={(e) => {
          onChange(e.target.value);
          onInteraction(); // Notify parent of interaction
        }}
        placeholder={`# Project paths
path/to/file1.ts
path/to/file2.ts

# External paths (absolute or relative)
/home/user/projects/other-project/src/main.ts
../other-project/src/components/Button.tsx`}
      />
      
      <div className="text-xs text-muted-foreground">
        <p>• You can use both paths within the project and external/absolute paths</p>
        <p>• Lines starting with # are treated as comments</p>
        <p>• External paths will be read from the file system directly</p>
      </div>
    </div>
  );
} 
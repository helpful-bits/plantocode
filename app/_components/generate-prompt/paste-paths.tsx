"use client";
import { Dispatch, SetStateAction, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import path from "path"; // Import path for checking absolute paths
import { normalizePath } from "@/lib/path-utils"; // Import normalizePath

interface PastePathsProps {
  value: string;
  onChange: (value: string) => void;
  onParsePaths?: (paths: string[]) => void;
  foundCount: number;
  projectDirectory?: string;
  warnings?: string[];
}

export default function PastePaths({
  value,
  onChange,
  onParsePaths,
  foundCount,
  projectDirectory,
  warnings = []
}: PastePathsProps) {
  useEffect(() => {
    if (value.trim()) { // Calculate whenever value changes
      const lines = value
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => !!l && !l.startsWith("#"));
      
      // Call onParsePaths if provided
      if (onParsePaths) {
        onParsePaths(lines);
      }
    }
  }, [value, onParsePaths]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">
          Or Paste File Paths (one per line):
          <span className="text-sm font-normal text-muted-foreground ml-2">
            Supports project paths and external/absolute paths
          </span>
        </label>
        {value.trim() && (
          <span className="text-sm font-medium bg-secondary text-secondary-foreground px-2 py-1 rounded">
            {foundCount} path(s) specified
          </span>
        )}
      </div>

      <Textarea
        className="border rounded bg-background text-foreground p-2 h-32 font-mono text-sm"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        placeholder={`# Project paths
path/to/file1.ts
path/to/file2.ts

# External paths (absolute or relative)
/home/user/projects/other-project/src/main.ts
../other-project/src/components/Button.tsx`}
      />
      
      {warnings && warnings.length > 0 && (
        <div className="text-amber-600 text-xs bg-amber-50 p-2 rounded">
          {warnings.map((warning, i) => (
            <p key={i}>⚠️ {warning}</p>
          ))}
        </div>
      )}
      
      <div className="text-xs text-muted-foreground">
        <p>• You can use both paths within the project and external/absolute paths</p>
        <p>• Lines starting with # are treated as comments</p>
        <p>• External paths will be read from the file system directly</p>
      </div>
    </div>
  );
} 
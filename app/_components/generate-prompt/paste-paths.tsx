"use client";
import { useEffect, useState, ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import path from "path";

interface PastePathsProps {
  value: string;
  onChange: (value: string) => void;
  projectDirectory?: string;
  onInteraction?: () => void;
  onParsePaths?: (paths: string[]) => void; // Callback after parsing paths
  warnings?: string[];
  children?: ReactNode; // Allow passing children, e.g., the Find Files button
  onFindRelevantFiles?: () => Promise<void>; // Add prop for finding relevant files
  isFindingFiles?: boolean; // Add prop for loading state
  canFindFiles?: boolean; // Add prop for button enablement condition
}

export default function PastePaths({
  value,
  onChange,
  onParsePaths,
  projectDirectory,
  onInteraction = () => {}, // Default to no-op
  warnings = [],
  children, // Receive children
  onFindRelevantFiles,
  isFindingFiles,
  canFindFiles,
}: PastePathsProps) {
  // Internal state to track the count of valid paths
  const [foundCount, setFoundCount] = useState(0);

  useEffect(() => {
    if (value.trim()) { // Calculate whenever value changes
      const lines = value
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => !!l && !l.startsWith("#"));
      
      // Update the internal count state
      setFoundCount(lines.length);

      // Call the optional onParsePaths callback if provided
      if (onParsePaths) {
        onParsePaths(lines); // Pass the filtered lines
      }
    } else setFoundCount(0); // Reset count if value is empty
  }, [value, onParsePaths]);

  return (
    <div className="flex flex-col gap-2 bg-card p-4 rounded-lg border shadow-sm">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">
          Or Paste File Paths (one per line):
          <span className="text-sm font-normal text-muted-foreground ml-2">
            Supports project paths and external/absolute paths
          </span>
        </label>
        {value.trim() && (
          <span className="text-sm font-medium bg-secondary text-secondary-foreground px-2 py-1 rounded">
            {foundCount} path(s) found
          </span>
        )}
      </div>

      <Textarea
        className="border rounded bg-background text-foreground p-2 h-32 font-mono text-sm"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onInteraction(); // Call interaction handler on change
        }}
        placeholder={`# Project paths
path/to/file1.ts
path/to/file2.ts

  # Lines starting with # are ignored
  # Paste paths from your file system or the 'Path Finder' output
  # The 'Find Relevant Files (AI)' button below can auto-populate this field.

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
      {/* Render children (the button) here */}
      {children && <div className="mt-1">{children}</div>}

      <div className="text-xs text-muted-foreground">
        <p>• You can use both paths within the project and external/absolute paths</p>
        <p>• Lines starting with # are treated as comments</p>
        <p>• External paths will be read from the file system directly</p>
      </div>
    </div>
  ); // Close return statement
}

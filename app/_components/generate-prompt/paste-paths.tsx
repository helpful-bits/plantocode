"use client";
import { Dispatch, SetStateAction, useEffect } from "react";

interface PastePathsProps {
  pastedPaths: string;
  onChange: (value: string) => void;
  foundFiles: any[];
  setPastedPathsFound: Dispatch<SetStateAction<number>>;
  pastedPathsFound: number;
}

export default function PastePaths({
  pastedPaths,
  onChange,
  foundFiles,
  setPastedPathsFound,
  pastedPathsFound,
}: PastePathsProps) {
  useEffect(() => {
    if (foundFiles.length > 0) {
      const lines = pastedPaths
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => !!l && !l.startsWith("#"));
      const available = foundFiles.map((f) => f.path);
      const matched = lines.filter((p) => available.includes(p)).length;
      setPastedPathsFound(matched);
    }
  }, [pastedPaths, foundFiles, setPastedPathsFound]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">
          Or Paste File Paths (one per line):
          <span className="text-sm font-normal text-muted-foreground ml-2">
            Overrides file selection when not empty
          </span>
        </label>
        {pastedPaths.trim() && (
          <span className="text-sm font-medium bg-secondary text-secondary-foreground px-2 py-1 rounded">
            {pastedPathsFound} files found
          </span>
        )}
      </div>

      <textarea
        className="border rounded bg-background text-foreground p-2 h-32 font-mono text-sm"
        value={pastedPaths}
        onChange={(e) => onChange(e.target.value)}
        placeholder="path/to/file1.ts
path/to/file2.ts
path/to/file3.ts"
      />
    </div>
  );
} 
"use client";

import { useFormat } from "@/lib/contexts/format-context";

export function FormatSelector() {
  const { outputFormat, customFormat, setOutputFormat, setCustomFormat } = useFormat();

  return (
    <div className="flex flex-col gap-2">
      <label className="font-bold text-foreground">Output Format:</label>
      <select
        className="border rounded bg-background text-foreground p-2"
        value={outputFormat}
        onChange={(e) => setOutputFormat(e.target.value as any)}
      >
        <option value="diff">Code Changes (Diff)</option>
        <option value="refactoring">Refactoring Plan</option>
        <option value="path-finder">Path Finder</option>
        <option value="custom">Custom Format</option>
      </select>
      
      {outputFormat === "custom" && (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-muted-foreground">
            Custom Format Instructions:
          </label>
          <textarea
            className="border rounded bg-background text-foreground p-2 h-32"
            value={customFormat}
            onChange={(e) => setCustomFormat(e.target.value)}
            placeholder="Enter custom format instructions for the AI..."
          />
        </div>
      )}
    </div>
  );
} 
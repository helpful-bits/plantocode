// =DEPRECATED=
// This component has been moved to @/components/ui/format-selector.tsx
// Please use the new component instead.

"use client";

import { OutputFormat } from "@/types";

interface FormatSelectorProps {
  outputFormat: OutputFormat;
  customFormat: string;
  onFormatChange: (format: OutputFormat) => void;
  onCustomFormatChange: (format: string) => void;
}

export default function FormatSelector({
  outputFormat,
  customFormat,
  onFormatChange,
  onCustomFormatChange,
}: FormatSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-bold text-foreground">Output Format:</label>
      <select
        className="border rounded bg-background text-foreground p-2"
        value={outputFormat}
        onChange={(e) => onFormatChange(e.target.value as OutputFormat)}
      >
        <option value="diff">Code Changes (Diff)</option>
        <option value="refactoring">Refactoring Plan</option>
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
            onChange={(e) => onCustomFormatChange(e.target.value)}
            placeholder="Enter custom format instructions for the AI..."
          />
        </div>
      )}
    </div>
  );
} 
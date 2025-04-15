"use client";

import { useState, useEffect } from "react";
import { useFormat } from "@/lib/contexts/format-context"; // Keep useFormat import
import { Textarea } from "./textarea"; // Import Textarea
// Keep OutputFormat import
import { OutputFormat } from "@/types"; // Keep OutputFormat import
export function FormatSelector() {
  const { outputFormat, customFormat, setOutputFormat, setCustomFormat } = useFormat();

  return (
    <div className="flex flex-col gap-2 bg-card p-5 rounded-lg shadow-sm border">
      <label htmlFor="outputFormatSelect" className="font-semibold text-lg text-card-foreground">Output Format:</label>
      <select
        id="outputFormatSelect"
        className="border rounded bg-background text-foreground p-2 h-10"
        value={outputFormat}
        onChange={(e) => setOutputFormat(e.target.value as OutputFormat)} // Use correct type assertion
      >
        <option value="diff">Code Changes (Diff)</option>
        <option value="refactoring">Refactoring Plan</option>
        <option value="path-finder">Path Finder</option> {/* Added Path Finder */}
        <option value="custom">Custom Format</option>
      </select>
      
      {outputFormat === "custom" && (
        <div className="flex flex-col gap-2 mt-2">
          <label htmlFor="customFormatInput" className="text-sm text-muted-foreground">
            Custom Format Instructions:
          </label>
          <Textarea
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

"use client";

import { Textarea } from "@/components/ui/textarea"; // Keep Textarea import
import { X, ToggleLeft, ToggleRight } from "lucide-react";

interface RegexInputProps {
  titleRegex: string;
  contentRegex: string;
  onTitleRegexChange: (value: string) => void;
  onContentRegexChange: (value: string) => void;
  titleRegexError?: string | null;
  contentRegexError?: string | null;
  onInteraction?: () => void; // Optional interaction handler
  onClearPatterns?: () => void; // Optional clear handler
  isRegexActive: boolean;
  onRegexActiveChange: (value: boolean) => void;
}

export default function RegexInput({
  titleRegex,
  contentRegex,
  onTitleRegexChange,
  onContentRegexChange,
  titleRegexError,
  contentRegexError,
  onInteraction = () => {}, // Default to no-op
  onClearPatterns,
  isRegexActive,
  onRegexActiveChange // Changed to use the prop
}: RegexInputProps) {
  return (
    <div className="flex flex-col gap-4 bg-card p-4 rounded-lg shadow-sm border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="font-bold text-foreground">File Filtering (Regex):</label>
          <button
            type="button"
            onClick={() => {
              onRegexActiveChange(!isRegexActive);
              onInteraction();
            }}
            className={`p-1 h-auto ${isRegexActive ? "text-primary" : "text-muted-foreground"}`}
            title={isRegexActive ? "Deactivate regex patterns" : "Activate regex patterns"}
          >
            {isRegexActive ? (
              <ToggleRight className="h-5 w-5" /> // Keep ToggleRight icon
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </button>
          <span className="text-xs text-muted-foreground">
            {isRegexActive ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Enable or disable regex filtering for file selection.</p>
        {(titleRegex.trim() || contentRegex.trim()) && (
            <button
            type="button"
            onClick={() => {
              if (onClearPatterns) onClearPatterns();
              onInteraction();
            }}
            className="text-destructive hover:text-destructive/80 flex items-center gap-1 h-7 text-xs px-2 rounded hover:bg-destructive/10"
            title="Clear both regex patterns"
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear Patterns</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="titleRegex" className="font-medium text-foreground">Title Regex:</label>
          <Textarea
            id="titleRegex" 
            value={titleRegex}
            onChange={(e) => {
              onTitleRegexChange(e.target.value);
              onInteraction();
            }}
            placeholder="Regex for file path..."
            className={`h-20 font-mono text-sm bg-background/80 ${!isRegexActive ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={!isRegexActive} // Keep disabled state
            aria-label="Title Regex" // Keep aria-label
          /> 
          {titleRegexError ? (
            <p className="text-xs text-destructive">{titleRegexError}</p>
          ) : (<p className="text-xs text-muted-foreground">Enter a JavaScript regex to filter files based on their path (e.g., `src/.*\.ts$`).</p>)} 
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="contentRegex" className="font-medium text-foreground">Content Regex:</label>
          <Textarea
            id="contentRegex" 
            value={contentRegex}
             onChange={(e) => {
               onContentRegexChange(e.target.value);
               onInteraction();
            }}
            placeholder="Regex for file content..."
            className={`h-20 font-mono text-sm bg-background/80 ${!isRegexActive ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={!isRegexActive} // Keep disabled state
            aria-label="Content Regex" // Keep aria-label
          />
          {contentRegexError ? ( 
            <p className="text-xs text-destructive">{contentRegexError}</p>
          ) : (<p className="text-xs text-muted-foreground">Enter a JavaScript regex to filter files based on their content (e.g., `import React`).</p>)}
        </div>
      </div>
    </div>
  );
}

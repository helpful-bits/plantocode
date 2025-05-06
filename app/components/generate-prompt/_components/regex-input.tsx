"use client";

import React from "react";
import { Textarea } from "@/components/ui/textarea"; // Keep Textarea import
import { X, ToggleLeft, ToggleRight } from "lucide-react";

interface RegexInputProps {
  titleRegex: string;
  contentRegex: string;
  negativeTitleRegex: string;
  negativeContentRegex: string;
  onTitleRegexChange: (value: string) => void;
  onContentRegexChange: (value: string) => void;
  onNegativeTitleRegexChange: (value: string) => void;
  onNegativeContentRegexChange: (value: string) => void;
  titleRegexError?: string | null;
  contentRegexError?: string | null;
  negativeTitleRegexError?: string | null;
  negativeContentRegexError?: string | null;
  onInteraction?: () => void; // Optional interaction handler
  onClearPatterns?: () => void; // Optional clear handler
  isRegexActive: boolean;
  onRegexActiveChange: (value: boolean) => void;
}

const RegexInput = React.memo(function RegexInput({
  titleRegex,
  contentRegex,
  negativeTitleRegex,
  negativeContentRegex,
  onTitleRegexChange,
  onContentRegexChange,
  onNegativeTitleRegexChange,
  onNegativeContentRegexChange,
  titleRegexError,
  contentRegexError,
  negativeTitleRegexError,
  negativeContentRegexError,
  onInteraction = () => {}, // Default to no-op
  onClearPatterns,
  isRegexActive,
  onRegexActiveChange // Changed to use the prop
}: RegexInputProps) {
  return (
    <div className="flex flex-col gap-4 bg-card rounded-lg">
      <div className="flex items-end justify-end">
        {(titleRegex.trim() || contentRegex.trim() || negativeTitleRegex.trim() || negativeContentRegex.trim()) && (
            <button
            type="button"
            onClick={() => {
              if (onClearPatterns) onClearPatterns();
              onInteraction();
            }}
            className="text-destructive hover:text-destructive/80 flex items-center gap-1 h-7 text-xs px-2 rounded hover:bg-destructive/10"
            title="Clear regex patterns"
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
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="negativeTitleRegex" className="font-medium text-foreground">Negative Title Regex:</label>
          <Textarea
            id="negativeTitleRegex" 
            value={negativeTitleRegex}
            onChange={(e) => {
              onNegativeTitleRegexChange(e.target.value);
              onInteraction();
            }}
            placeholder="Regex to exclude by path..."
            className={`h-20 font-mono text-sm bg-background/80 ${!isRegexActive ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={!isRegexActive}
            aria-label="Negative Title Regex"
          /> 
          {negativeTitleRegexError ? (
            <p className="text-xs text-destructive">{negativeTitleRegexError}</p>
          ) : (<p className="text-xs text-muted-foreground">Enter a JavaScript regex to exclude files based on their path (e.g., `test/.*\.ts$`).</p>)} 
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="negativeContentRegex" className="font-medium text-foreground">Negative Content Regex:</label>
          <Textarea
            id="negativeContentRegex" 
            value={negativeContentRegex}
             onChange={(e) => {
               onNegativeContentRegexChange(e.target.value);
               onInteraction();
            }}
            placeholder="Regex to exclude by content..."
            className={`h-20 font-mono text-sm bg-background/80 ${!isRegexActive ? "opacity-60 cursor-not-allowed" : ""}`}
            disabled={!isRegexActive}
            aria-label="Negative Content Regex"
          />
          {negativeContentRegexError ? ( 
            <p className="text-xs text-destructive">{negativeContentRegexError}</p>
          ) : (<p className="text-xs text-muted-foreground">Enter a JavaScript regex to exclude files based on their content (e.g., `test|mock`).</p>)}
        </div>
      </div>
    </div>
  );
});

export default RegexInput;

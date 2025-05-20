"use client";

import { X } from "lucide-react";
import React from "react";

import { Textarea } from "@/ui/textarea";

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
  onClearPatterns?: () => void; // Optional clear handler
  disabled?: boolean; // Optional disabled state
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
  onClearPatterns,
  disabled = false,
}: RegexInputProps) {
  return (
    <div className="flex flex-col gap-4 bg-card rounded-lg">
      <div className="flex items-end justify-end">
        {(titleRegex.trim() ||
          contentRegex.trim() ||
          negativeTitleRegex.trim() ||
          negativeContentRegex.trim()) && (
          <button
            type="button"
            onClick={() => {
              if (onClearPatterns) onClearPatterns();
            }}
            className="text-destructive hover:text-destructive/80 flex items-center gap-1 h-7 text-xs px-2 rounded hover:bg-destructive/10"
            title="Clear regex patterns"
            disabled={disabled}
          >
            <X className="h-3.5 w-3.5" />
            <span>Clear Patterns</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="titleRegex" className="font-medium text-foreground">
            Title Regex:
          </label>
          <Textarea
            id="titleRegex"
            value={titleRegex}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              // Just update the value directly - handlers now handle debouncing internally
              onTitleRegexChange(e.target.value);
            }}
            placeholder="Regex for file path..."
            className="h-20 font-mono text-sm bg-background/80 rounded-md"
            aria-label="Title Regex"
            disabled={disabled}
          />
          {titleRegexError ? (
            <p className="text-xs text-destructive">{titleRegexError}</p>
          ) : (
            <p className="text-xs text-muted-foreground text-balance">
              Filter files by matching their path (e.g., `src/.*\.ts`).
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="contentRegex" className="font-medium text-foreground">
            Content Regex:
          </label>
          <Textarea
            id="contentRegex"
            value={contentRegex}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              // Just update the value directly - handlers now handle debouncing internally
              onContentRegexChange(e.target.value);
            }}
            placeholder="Regex for file content..."
            className="h-20 font-mono text-sm bg-background/80 rounded-md"
            aria-label="Content Regex"
            disabled={disabled}
          />
          {contentRegexError ? (
            <p className="text-xs text-destructive">{contentRegexError}</p>
          ) : (
            <p className="text-xs text-muted-foreground text-balance">
              Filter files by matching their content (e.g., `import React`).
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="negativeTitleRegex"
            className="font-medium text-foreground"
          >
            Negative Title Regex:
          </label>
          <Textarea
            id="negativeTitleRegex"
            value={negativeTitleRegex}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              // Just update the value directly - handlers now handle debouncing internally
              onNegativeTitleRegexChange(e.target.value);
            }}
            placeholder="Regex to exclude by path..."
            className="h-20 font-mono text-sm bg-background/80 rounded-md"
            aria-label="Negative Title Regex"
            disabled={disabled}
          />
          {negativeTitleRegexError ? (
            <p className="text-xs text-destructive">
              {negativeTitleRegexError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground text-balance">
              Exclude files by matching their path (e.g., `test/.*\.ts`).
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="negativeContentRegex"
            className="font-medium text-foreground"
          >
            Negative Content Regex:
          </label>
          <Textarea
            id="negativeContentRegex"
            value={negativeContentRegex}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              // Just update the value directly - handlers now handle debouncing internally
              onNegativeContentRegexChange(e.target.value);
            }}
            placeholder="Regex to exclude by content..."
            className="h-20 font-mono text-sm bg-background/80 rounded-md"
            aria-label="Negative Content Regex"
            disabled={disabled}
          />
          {negativeContentRegexError ? (
            <p className="text-xs text-destructive">
              {negativeContentRegexError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground text-balance">
              Exclude files by matching their content (e.g., `test|mock`).
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

export default RegexInput;

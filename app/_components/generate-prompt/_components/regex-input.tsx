"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface RegexInputProps {
  titleRegex: string;
  contentRegex: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  titleRegexError?: string | null;
  contentRegexError?: string | null;
  onClearPatterns?: () => void;
}

export default function RegexInput({
  titleRegex,
  contentRegex,
  onTitleChange,
  onContentChange,
  titleRegexError,
  contentRegexError,
  onClearPatterns,
}: RegexInputProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">Regex Patterns:</label>
        {(titleRegex || contentRegex) && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onClearPatterns}
            className="text-destructive hover:text-destructive flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            <span>Clear Patterns</span>
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="titleRegex" className="font-medium text-foreground">Title Regex:</label>
          <Textarea id="titleRegex" value={titleRegex} onChange={(e) => onTitleChange(e.target.value)} placeholder="Regex for file path..." className="h-20 font-mono text-sm" />
          {titleRegexError ? (
            <p className="text-xs text-destructive">{titleRegexError}</p>
          ) : (<p className="text-xs text-muted-foreground">Matches against file paths (e.g., `src/.*\.ts$`).</p>)}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="contentRegex" className="font-medium text-foreground">Content Regex:</label>
          <Textarea id="contentRegex" value={contentRegex} onChange={(e) => onContentChange(e.target.value)} placeholder="Regex for file content..." className="h-20 font-mono text-sm" />
          {contentRegexError ? (
            <p className="text-xs text-destructive">{contentRegexError}</p>
          ) : (<p className="text-xs text-muted-foreground">Matches against file content (e.g., `useState\(`).</p>)}
        </div>
      </div>
    </div>
  );
}

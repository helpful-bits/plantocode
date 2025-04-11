"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { X, ToggleLeft, ToggleRight } from "lucide-react";

interface RegexInputProps {
  titleRegex: string;
  contentRegex: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  titleRegexError?: string | null;
  contentRegexError?: string | null;
  onClearPatterns?: () => void;
  isActive: boolean;
  onToggleActive: () => void;
}

export default function RegexInput({
  titleRegex,
  contentRegex,
  onTitleChange,
  onContentChange,
  titleRegexError,
  contentRegexError,
  onClearPatterns,
  isActive,
  onToggleActive,
}: RegexInputProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="font-bold text-foreground">Regex Patterns:</label>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleActive}
            className={`p-1 h-auto ${isActive ? "text-primary" : "text-muted-foreground"}`}
            title={isActive ? "Deactivate regex patterns" : "Activate regex patterns"}
          >
            {isActive ? (
              <ToggleRight className="h-5 w-5" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
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
          <Textarea 
            id="titleRegex" 
            value={titleRegex} 
            onChange={(e) => onTitleChange(e.target.value)} 
            placeholder="Regex for file path..." 
            className={`h-20 font-mono text-sm ${!isActive ? "opacity-60" : ""}`} 
          />
          {titleRegexError ? (
            <p className="text-xs text-destructive">{titleRegexError}</p>
          ) : (<p className="text-xs text-muted-foreground">Matches against file paths (e.g., `src/.*\.ts$`).</p>)}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="contentRegex" className="font-medium text-foreground">Content Regex:</label>
          <Textarea 
            id="contentRegex" 
            value={contentRegex} 
            onChange={(e) => onContentChange(e.target.value)} 
            placeholder="Regex for file content..." 
            className={`h-20 font-mono text-sm ${!isActive ? "opacity-60" : ""}`} 
          />
          {contentRegexError ? (
            <p className="text-xs text-destructive">{contentRegexError}</p>
          ) : (<p className="text-xs text-muted-foreground">Matches against file content (e.g., `useState\(`).</p>)}
        </div>
      </div>
    </div>
  );
}

"use client";

import { Textarea } from "@/components/ui/textarea";

interface RegexInputProps {
  titleRegex: string;
  contentRegex: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
}

export default function RegexInput({
  titleRegex,
  contentRegex,
  onTitleChange,
  onContentChange,
}: RegexInputProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="titleRegex" className="font-medium text-foreground">Title Regex:</label>
        <Textarea id="titleRegex" value={titleRegex} onChange={(e) => onTitleChange(e.target.value)} placeholder="Regex for file path..." className="h-20 font-mono text-sm" />
        <p className="text-xs text-muted-foreground">Matches against file paths (e.g., `src/.*\.ts$`).</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="contentRegex" className="font-medium text-foreground">Content Regex:</label>
        <Textarea id="contentRegex" value={contentRegex} onChange={(e) => onContentChange(e.target.value)} placeholder="Regex for file content..." className="h-20 font-mono text-sm" />
        <p className="text-xs text-muted-foreground">Matches against file content (e.g., `useState\(`).</p>
      </div>
    </div>
  );
}

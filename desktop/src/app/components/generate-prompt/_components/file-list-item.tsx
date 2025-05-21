"use client";

import { FileText, Copy } from "lucide-react";
import { useCallback, memo, MouseEvent, KeyboardEvent } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/utils/utils";

import type { FileInfo } from "@/types";

interface FileListItemProps {
  file: FileInfo;
  onToggleSelection: (path: string) => void;
  onToggleExclusion: (path: string) => void;
  onAddPath: (path: string, e: MouseEvent) => void;
  copiedPath: string | null;
  disabled?: boolean;
}

/**
 * Component to render a single file row in the file browser
 */
function FileListItem({
  file,
  onToggleSelection,
  onToggleExclusion,
  onAddPath,
  copiedPath,
  disabled = false,
}: FileListItemProps) {
  // Extract directory part and filename for display
  const pathParts = file.path.split("/");
  const fileName = pathParts.pop() || "";
  const dirPath = pathParts.join("/");

  // Handle copying file path to clipboard (memoized)
  const handleCopyPath = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation(); // Prevent selection toggle
      e.preventDefault(); // Prevent form submission

      navigator.clipboard
        .writeText(file.path)
        .then(() => onAddPath(file.path, e))
        .catch(() => {});
    },
    [file.path, onAddPath]
  );

  // Handle clicking on file name or path (memoized)
  const handlePathClick = useCallback(
    (eventOrTarget: MouseEvent | HTMLElement, keyboardEvent?: KeyboardEvent) => {
      // Handle both mouse events and keyboard events
      const e = eventOrTarget instanceof HTMLElement ? keyboardEvent as KeyboardEvent : eventOrTarget as MouseEvent;
      e.preventDefault();

      // Only toggle selection if file is not force excluded and not disabled
      if (!file.forceExcluded && !disabled) {
        onToggleSelection(file.path);
      }
    },
    [file.path, file.forceExcluded, onToggleSelection, disabled]
  );

  // Handle toggle selection with proper prevention
  const handleToggleSelection = useCallback(
    (eventOrTarget: MouseEvent | HTMLElement, keyboardEvent?: KeyboardEvent) => {
      // Handle both mouse events and keyboard events
      const e = eventOrTarget instanceof HTMLElement ? keyboardEvent as KeyboardEvent : eventOrTarget as MouseEvent;
      e.preventDefault();
      e.stopPropagation();

      if (!disabled) {
        onToggleSelection(file.path);
      }
    },
    [file.path, onToggleSelection, disabled]
  );

  // Handle toggle exclusion with proper prevention
  const handleToggleExclusion = useCallback(
    (eventOrTarget: MouseEvent | HTMLElement, keyboardEvent?: KeyboardEvent) => {
      // Handle both mouse events and keyboard events
      const e = eventOrTarget instanceof HTMLElement ? keyboardEvent as KeyboardEvent : eventOrTarget as MouseEvent;
      e.preventDefault();
      e.stopPropagation();

      if (!disabled) {
        onToggleExclusion(file.path);
      }
    },
    [file.path, onToggleExclusion, disabled]
  );

  // Format file size with appropriate units
  const formatFileSize = (sizeInBytes: number | undefined) => {
    // Handle undefined size values
    const bytes = sizeInBytes ?? 0;

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 text-sm py-1.5 rounded-sm px-2",
        "transition-colors duration-150",
        file.included && !file.forceExcluded ? "bg-primary/5" : "",
        file.forceExcluded ? "opacity-60" : "hover:bg-accent/50",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      )}
      data-path={file.path}
      data-included={String(!!file.included)}
      data-excluded={String(!!file.forceExcluded)}
      onClick={handlePathClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handlePathClick(e.target as HTMLElement, e);
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Include checkbox */}
        <div
          className="flex items-center cursor-pointer"
          onClick={handleToggleSelection}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleToggleSelection(e.target as HTMLElement, e);
          }}
        >
          <input
            type="checkbox"
            checked={!!file.included}
            readOnly
            disabled={disabled}
            className={cn(
              "flex-shrink-0 accent-primary w-3.5 h-3.5",
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            )}
            title="Include file in generation"
            aria-label={`Include ${file.path}`}
          />
        </div>

        {/* Force exclude checkbox */}
        <div
          className={cn(
            "flex items-center",
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          )}
          onClick={handleToggleExclusion}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleToggleExclusion(e.target as HTMLElement, e);
          }}
          title="Force Exclude (cannot be included)"
        >
          <input
            type="checkbox"
            checked={!!file.forceExcluded}
            className={cn(
              "appearance-none flex-shrink-0 w-3.5 h-3.5 border border-destructive rounded-[2px] bg-transparent checked:bg-destructive/20 focus:ring-offset-0 focus:ring-1 focus:ring-destructive",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            )}
            disabled={disabled}
            readOnly
            aria-label={`Force exclude ${file.path}`}
          />
        </div>

        {/* File icon */}
        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

        {/* File path */}
        <span
          className={cn(
            "font-mono flex-1 truncate",
            file.forceExcluded ? "line-through text-muted-foreground/80" : ""
          )}
          title={`${file.path}${file.forceExcluded ? " (force excluded)" : file.included ? " (included)" : " (not included)"}`}
        >
          {dirPath ? (
            <>
              <span className="opacity-60 text-xs">{dirPath}/</span>
              <span className="font-semibold">{fileName}</span>
            </>
          ) : (
            fileName
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* File size */}
        <span className="text-muted-foreground text-xs font-mono">
          {formatFileSize(file.size)}
        </span>

        {/* Copy path button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopyPath}
          disabled={disabled}
          className={cn(
            "h-6 w-6 rounded-sm flex items-center justify-center transition-colors",
            copiedPath === file.path ? "text-primary" : "text-muted-foreground",
            disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/70"
          )}
          title="Copy file path to clipboard"
          aria-label="Copy path to clipboard"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Use React.memo for performance optimization
export default memo(FileListItem);

"use client";

import { FileText, Copy } from "lucide-react";
import { useCallback, memo } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/utils/utils";
import { humanFileSize } from "@/utils/file-size";

import type { FileInfo } from "@/types";

interface FileListItemProps {
  file: FileInfo;
  onToggleSelection: (path: string) => void;
  onToggleExclusion: (path: string) => void;
  onAddPath: (path: string, e: React.MouseEvent<HTMLButtonElement>) => void;
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
    (e: React.MouseEvent<HTMLButtonElement>) => {
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
  const handleItemClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!disabled) {
        onToggleSelection(file.path);
      }
    },
    [file.path, file.forceExcluded, onToggleSelection, disabled]
  );



  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 text-xs py-2 rounded-lg px-3",
        "transition-colors duration-150",
        file.included && !file.forceExcluded ? "bg-muted border border-border/30" : "",
        file.forceExcluded ? "opacity-60" : "hover:bg-muted/80 hover:backdrop-blur-sm",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      )}
      data-path={file.path}
      data-included={String(!!file.included)}
      data-excluded={String(!!file.forceExcluded)}
      onClick={handleItemClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!disabled) {
            onToggleSelection(file.path);
          }
        }
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Include checkbox */}
        <div
          className="flex items-center cursor-pointer relative"
          onClick={(e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            if (!disabled) {
              onToggleSelection(file.path);
            }
          }}
          role="checkbox"
          aria-checked={!!file.included}
          aria-label={`Include file ${file.path.split('/').pop() || file.path}`}
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              if (!disabled) {
                onToggleSelection(file.path);
              }
            }
          }}
        >
          <input
            type="checkbox"
            checked={!!file.included}
            readOnly
            disabled={disabled}
            className={cn(
              "appearance-none flex-shrink-0 w-3.5 h-3.5 border rounded-[2px] transition-colors",
              "bg-input border-border/50",
              "checked:bg-primary checked:border-primary checked:text-primary-foreground",
              "hover:border-border/70",
              "checked:hover:bg-primary/90 checked:hover:border-primary",
              "focus:ring-offset-0 focus:ring-1 focus:ring-primary/50",
              "relative",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            )}
            title="Include file in generation"
            aria-label={`Include ${file.path}`}
          />
          {/* Checkmark icon for include checkbox */}
          {file.included && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg 
                className="w-2.5 h-2.5 text-primary-foreground" 
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* Force exclude checkbox */}
        <div
          className={cn(
            "flex items-center cursor-pointer relative",
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          )}
          onClick={(e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            if (!disabled) {
              onToggleExclusion(file.path);
            }
          }}
          role="checkbox"
          aria-checked={!!file.forceExcluded}
          aria-label={`Force exclude file ${file.path.split('/').pop() || file.path}`}
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              if (!disabled) {
                onToggleExclusion(file.path);
              }
            }
          }}
          title="Force Exclude (cannot be included)"
        >
          <input
            type="checkbox"
            checked={!!file.forceExcluded}
            className={cn(
              "appearance-none flex-shrink-0 w-3.5 h-3.5 border border-destructive rounded-[2px] bg-background transition-colors",
              "checked:bg-destructive checked:border-destructive checked:text-destructive-foreground",
              "hover:border-destructive/70",
              "checked:hover:bg-destructive/90 checked:hover:border-destructive",
              "focus:ring-offset-0 focus:ring-1 focus:ring-destructive/50",
              "relative",
              disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            )}
            disabled={disabled}
            readOnly
            aria-label={`Force exclude ${file.path}`}
          />
          {/* Checkmark icon for force exclude checkbox */}
          {file.forceExcluded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <svg 
                className="w-2.5 h-2.5 text-destructive-foreground" 
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>

        {/* File icon */}
        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />

        {/* File path */}
        <span
          className={cn(
            "font-mono flex-1 truncate text-foreground",
            file.forceExcluded ? "line-through text-muted-foreground/80" : ""
          )}
          title={`${file.path}${file.forceExcluded ? " (force excluded)" : file.included ? " (included)" : " (not included)"}`}
        >
          {dirPath ? (
            <>
              <span className="opacity-60 text-xs text-muted-foreground">{dirPath}/</span>
              <span className="font-semibold text-foreground">{fileName}</span>
            </>
          ) : (
            fileName
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* File size */}
        <span className="text-muted-foreground text-xs font-mono">
          {humanFileSize(file.size ?? 0)}
        </span>

        {/* Copy path button */}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopyPath}
          disabled={disabled}
          className={cn(
            copiedPath === file.path ? "text-primary" : "text-muted-foreground"
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
FileListItem.displayName = "FileListItem";

export default memo(FileListItem);

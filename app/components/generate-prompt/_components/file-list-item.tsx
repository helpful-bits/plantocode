"use client";

import React from "react";
import { FileText, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileInfo } from "@/types";
import { cn } from "@/lib/utils";

interface FileListItemProps {
  file: FileInfo;
  onToggleSelection: (path: string) => void;
  onToggleExclusion: (path: string) => void;
  onAddPath: (path: string, e: React.MouseEvent) => void;
  copiedPath: string | null;
}

/**
 * Component to render a single file row in the file browser
 */
function FileListItem({
  file,
  onToggleSelection,
  onToggleExclusion,
  onAddPath,
  copiedPath
}: FileListItemProps) {
  // Extract directory part for grouping
  const pathParts = file.path.split('/');
  const fileName = pathParts.pop() || '';
  const dirPath = pathParts.join('/');
  
  const handleToggleForceExcludeOffAndInclude = () => {
    if (file.forceExcluded) {
      // First disable force exclude, then enable inclusion
      onToggleExclusion(file.path);
      if (!file.included) {
        onToggleSelection(file.path);
      }
    } else {
      // Normal toggle
      onToggleSelection(file.path);
    }
  };
  
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
        "flex items-center justify-between gap-2 text-sm py-1.5 hover:bg-accent/50 rounded px-2",
        file.included && !file.forceExcluded ? "bg-primary/5" : "",
        file.forceExcluded ? "opacity-60" : ""
      )}
      data-path={file.path}
      data-included={String(!!file.included)}
      data-excluded={String(!!file.forceExcluded)}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Include checkbox */}
        <div className="flex items-center cursor-pointer" onClick={() => onToggleSelection(file.path)}>
          <input
            type="checkbox"
            checked={!!file.included}
            readOnly
            className="cursor-pointer flex-shrink-0 accent-primary" 
            title="Include file in generation"
            aria-label={`Include ${file.path}`}
          />
        </div>
        
        {/* Force exclude checkbox */}
        <div 
          className="flex items-center cursor-pointer" 
          onClick={() => onToggleExclusion(file.path)}
          title="Force Exclude (cannot be included)"
        >
          <input
            type="checkbox"
            checked={!!file.forceExcluded}
            className={cn("cursor-pointer accent-destructive flex-shrink-0 w-3.5 h-3.5")}
            readOnly
            aria-label={`Force exclude ${file.path}`}
          />
        </div>
        
        {/* File icon */}
        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        
        {/* File path */}
        <span
          className={cn(
            "font-mono flex-1 truncate cursor-pointer", 
            file.forceExcluded && "line-through text-muted-foreground/80"
          )}
          onClick={handleToggleForceExcludeOffAndInclude}
          title={`${file.path}${file.forceExcluded ? " (force excluded)" : file.included ? " (included)" : " (not included)"}`}
        >
          {dirPath ? (
            <> 
              <span className="opacity-60 text-xs">{dirPath}/</span>
              <span className="font-semibold">{fileName}</span>
            </>
          ) : fileName}
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {/* File size */}
        <span className="text-muted-foreground text-xs">{formatFileSize(file.size)}</span>
        
        {/* Add path button */}
        <Button
          variant="ghost" 
          size="icon"
          onClick={(e) => onAddPath(file.path, e)}
          className={cn(
            "h-6 w-6 rounded-sm flex items-center justify-center hover:bg-accent/70 transition-colors",
            copiedPath === file.path ? "text-primary" : "text-muted-foreground"
          )}
          title="Add file path to selection"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Use React.memo for performance optimization
export default React.memo(FileListItem);
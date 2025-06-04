"use client";

import React from "react";
import { FileText, Copy, Check } from "lucide-react";
import { Button } from "@/ui/button";
import { cn } from "@/utils/utils";
import { humanFileSize } from "@/utils/file-size";

interface SimpleFileInfo {
  path: string;
  size?: number;
  included: boolean;
  excluded: boolean;
}

interface SimpleFileItemProps {
  file: SimpleFileInfo;
  onToggleSelection: (path: string) => void;
  onToggleExclusion: (path: string) => void;
}

/**
 * EXTREMELY SIMPLE file item component
 * Just displays file info and handles clicks
 * Memoized to prevent unnecessary re-renders
 */
export const SimpleFileItem = React.memo(function SimpleFileItem({
  file,
  onToggleSelection,
  onToggleExclusion,
}: SimpleFileItemProps) {
  const pathParts = file.path.split("/");
  const fileName = pathParts.pop() || "";
  const dirPath = pathParts.join("/");

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(file.path);
    } catch (error) {
      // Ignore copy errors
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 text-xs py-2 rounded-lg px-3 transition-colors",
        file.included && !file.excluded ? "bg-muted/60 border border-border/20 file-row-selected" : "",
        file.excluded ? "opacity-60" : "hover:bg-muted/40"
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Include checkbox */}
        <div
          onClick={() => !file.excluded && onToggleSelection(file.path)}
          className="custom-checkbox-container cursor-pointer"
        >
          <input
            type="checkbox"
            checked={file.included}
            onChange={() => {}} // Controlled by onClick
            disabled={file.excluded}
            className="custom-checkbox"
          />
          <div className="custom-checkbox-checkmark">
            <Check className="h-3 w-3" />
          </div>
        </div>

        {/* Exclude checkbox */}
        <div
          onClick={() => onToggleExclusion(file.path)}
          className="custom-checkbox-container cursor-pointer"
        >
          <input
            type="checkbox"
            checked={file.excluded}
            onChange={() => {}} // Controlled by onClick
            className="custom-checkbox destructive"
          />
          <div className="custom-checkbox-checkmark">
            <Check className="h-3 w-3" />
          </div>
        </div>

        {/* File info */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "font-mono flex-1 truncate text-foreground",
              file.excluded ? "line-through text-muted-foreground/80" : ""
            )}
            title={file.path}
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
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs font-mono">
          {humanFileSize(file.size ?? 0)}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={copyToClipboard}
          className="text-muted-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});
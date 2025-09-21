"use client";

import React from "react";
import { FileText, Copy } from "lucide-react";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { cn } from "@/utils/utils";
import { humanFileSize } from "@/utils/file-size";
import { formatTimeAgo } from "@/utils/date-utils";
import type { ProjectFileInfo } from "@/types/tauri-commands";

interface FileInfo extends ProjectFileInfo {
  included: boolean;
  excluded: boolean;
}

interface FileItemProps {
  file: FileInfo;
  onToggleSelection: (path: string) => void;
  onToggleExclusion: (path: string) => void;
}

export const FileItem = React.memo(function SimpleFileItem({
  file,
  onToggleSelection,
  onToggleExclusion,
}: FileItemProps) {
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
        "flex items-center gap-2 text-xs py-2 px-2 rounded transition-colors",
        file.included && !file.excluded ? "bg-muted/60 border border-border/20 file-row-selected" : "",
        file.excluded ? "opacity-60" : "hover:bg-muted/40"
      )}
    >
      {/* Select/Exclude columns */}
      <div className="w-16 flex items-center gap-1">
        {/* Include checkbox */}
        <Checkbox
          checked={file.included}
          onCheckedChange={() => !file.excluded && onToggleSelection(file.path)}
          disabled={file.excluded}
        />

        {/* Exclude checkbox */}
        <Checkbox
          checked={file.excluded}
          onCheckedChange={() => onToggleExclusion(file.path)}
          className="destructive"
        />
      </div>

      {/* File Name column */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
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

      {/* Size column */}
      <div className="w-20 text-right">
        <span className="text-muted-foreground text-xs font-mono">
          {humanFileSize(file.size)}
        </span>
      </div>

      {/* Modified column */}
      <div className="w-28 text-right">
        <span className="text-muted-foreground text-xs">
          {file.modifiedAt ? formatTimeAgo(file.modifiedAt) : "N/A"}
        </span>
      </div>

      {/* Actions column */}
      <div className="w-10 flex justify-end">
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
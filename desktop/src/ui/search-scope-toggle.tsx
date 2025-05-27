"use client";

import { FileCheck, Files } from "lucide-react";
import { FC } from "react";

import { Button } from "@/ui/button";

interface SearchScopeToggleProps {
  searchSelectedFilesOnly: boolean;
  onToggle: (value?: boolean) => void;
  disabled?: boolean;
  includedCount?: number;
}

/**
 * A segmented control toggle for switching between search scopes (all files vs selected files)
 */
export const SearchScopeToggle: FC<SearchScopeToggleProps> = ({
  searchSelectedFilesOnly,
  onToggle,
  disabled = false,
  includedCount = 0,
}) => {
  return (
    <div className="flex items-center border border-border/60 rounded-lg overflow-hidden shadow-soft backdrop-blur-sm bg-background/80">
      <Button
        variant={!searchSelectedFilesOnly ? "filter-active" : "filter"}
        size="xs"
        className="px-3"
        onClick={() => onToggle(false)}
        disabled={disabled}
        title="Search in all project files"
      >
        <Files className="h-3.5 w-3.5 mr-1.5" />
        All Files
      </Button>

      <div className="w-[1px] h-6 bg-border/40" />

      <Button
        variant={searchSelectedFilesOnly ? "filter-active" : "filter"}
        size="xs"
        className="px-3"
        onClick={() => onToggle(true)}
        disabled={disabled || includedCount === 0}
        title={
          includedCount === 0
            ? "Select files first to use this option"
            : `Search only in ${includedCount} selected files`
        }
      >
        <FileCheck className="h-3.5 w-3.5 mr-1.5" />
        Selected{includedCount > 0 ? ` (${includedCount})` : ""}
      </Button>
    </div>
  );
};
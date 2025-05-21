"use client";

import { FileCheck, Files } from "lucide-react";
import { FC } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/utils/utils";

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
    <div className="flex items-center border rounded-md overflow-hidden dark:border-border">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-none border-0 h-8 px-3",
          !searchSelectedFilesOnly
            ? "bg-primary/10 text-primary font-medium dark:bg-primary/20 dark:text-primary-foreground"
            : "text-muted-foreground dark:text-muted-foreground/90"
        )}
        onClick={() => onToggle(false)}
        disabled={disabled}
        title="Search in all project files"
      >
        <Files className="h-3.5 w-3.5 mr-1.5" />
        All Files
      </Button>

      <div className="w-[1px] h-6 bg-border dark:bg-border" />

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-none border-0 h-8 px-3",
          searchSelectedFilesOnly
            ? "bg-primary/10 text-primary font-medium dark:bg-primary/20 dark:text-primary-foreground"
            : "text-muted-foreground dark:text-muted-foreground/90"
        )}
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
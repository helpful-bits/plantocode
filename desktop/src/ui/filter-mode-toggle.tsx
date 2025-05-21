"use client";

import { Files, FileCheck, FilterX } from "lucide-react";
import { FC } from "react";

import { Button } from "@/ui/button";
import { cn } from "@/utils/utils";

export type FilterMode = "all" | "selected" | "regex";

interface FilterModeToggleProps {
  currentMode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
  isRegexAvailable: boolean;
  disabled?: boolean;
}

/**
 * A segmented control toggle for switching between different filter modes
 */
export const FilterModeToggle: FC<FilterModeToggleProps> = ({
  currentMode,
  onModeChange,
  isRegexAvailable,
  disabled = false,
}) => {
  return (
    <div className="flex items-center border rounded-md overflow-hidden dark:border-border">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-none border-0 h-8 px-3",
          currentMode === "all"
            ? "bg-primary/10 text-primary font-medium dark:bg-primary/20 dark:text-primary-foreground"
            : "text-muted-foreground dark:text-muted-foreground/90"
        )}
        onClick={() => onModeChange("all")}
        disabled={disabled}
        title="Show all project files"
      >
        <Files className="h-3.5 w-3.5 mr-1.5" />
        All
      </Button>

      <div className="w-[1px] h-6 bg-border dark:bg-border" />

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-none border-0 h-8 px-3",
          currentMode === "selected"
            ? "bg-primary/10 text-primary font-medium dark:bg-primary/20 dark:text-primary-foreground"
            : "text-muted-foreground dark:text-muted-foreground/90"
        )}
        onClick={() => onModeChange("selected")}
        disabled={disabled}
        title="Show only selected files"
      >
        <FileCheck className="h-3.5 w-3.5 mr-1.5" />
        Selected
      </Button>

      <div className="w-[1px] h-6 bg-border dark:bg-border" />

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-none border-0 h-8 px-3",
          currentMode === "regex"
            ? "bg-primary/10 text-primary font-medium dark:bg-primary/20 dark:text-primary-foreground"
            : "text-muted-foreground dark:text-muted-foreground/90",
          !isRegexAvailable && "opacity-50 dark:opacity-40"
        )}
        onClick={() => onModeChange("regex")}
        disabled={disabled || !isRegexAvailable}
        title={
          isRegexAvailable
            ? "Filter files using regex patterns"
            : "Define regex patterns to enable this filter mode"
        }
      >
        <FilterX className="h-3.5 w-3.5 mr-1.5" />
        Regex
      </Button>
    </div>
  );
};
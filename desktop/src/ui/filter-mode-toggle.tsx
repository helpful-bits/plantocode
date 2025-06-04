"use client";

import { Files, FileCheck } from "lucide-react";
import { FC } from "react";

import { Button } from "@/ui/button";

export type FilterMode = "all" | "selected";

interface FilterModeToggleProps {
  currentMode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
  disabled?: boolean;
  includedCount?: number;
  totalCount?: number;
}

/**
 * A segmented control toggle for switching between different filter modes
 */
export const FilterModeToggle: FC<FilterModeToggleProps> = ({
  currentMode,
  onModeChange,
  disabled = false,
  includedCount = 0,
  totalCount = 0,
}) => {
  return (
    <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
      <Button
        variant={currentMode === "all" ? "filter-active" : "filter"}
        size="xs"
        className="px-3 h-9"
        onClick={() => onModeChange("all")}
        disabled={disabled}
        title={`Show all ${totalCount} project files`}
      >
        <Files className="h-3.5 w-3.5 mr-1.5" />
        All{totalCount > 0 ? ` (${totalCount})` : ""}
      </Button>

      <div className="w-[1px] h-6 bg-border/40" />

      <Button
        variant={currentMode === "selected" ? "filter-active" : "filter"}
        size="xs"
        className="px-3 h-9"
        onClick={() => onModeChange("selected")}
        disabled={disabled || includedCount === 0}
        title={
          includedCount === 0
            ? "Select files first to use this option"
            : `Show only the ${includedCount} selected files`
        }
      >
        <FileCheck className="h-3.5 w-3.5 mr-1.5" />
        Selected{includedCount > 0 ? ` (${includedCount})` : ""}
      </Button>

    </div>
  );
};
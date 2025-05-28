"use client";

import { Files, FileCheck } from "lucide-react";
import { FC } from "react";

import { Button } from "@/ui/button";

export type FilterMode = "all" | "selected";

interface FilterModeToggleProps {
  currentMode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
  disabled?: boolean;
}

/**
 * A segmented control toggle for switching between different filter modes
 */
export const FilterModeToggle: FC<FilterModeToggleProps> = ({
  currentMode,
  onModeChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-center border border-border rounded-md overflow-hidden">
      <Button
        variant={currentMode === "all" ? "filter-active" : "filter"}
        size="xs"
        className="px-3"
        onClick={() => onModeChange("all")}
        disabled={disabled}
        title="Show all project files"
      >
        <Files className="h-3.5 w-3.5 mr-1.5" />
        All
      </Button>

      <div className="w-[1px] h-6 bg-border/40" />

      <Button
        variant={currentMode === "selected" ? "filter-active" : "filter"}
        size="xs"
        className="px-3"
        onClick={() => onModeChange("selected")}
        disabled={disabled}
        title="Show only selected files"
      >
        <FileCheck className="h-3.5 w-3.5 mr-1.5" />
        Selected
      </Button>

    </div>
  );
};
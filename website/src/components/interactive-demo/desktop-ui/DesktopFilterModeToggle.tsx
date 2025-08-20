// Desktop Filter Mode Toggle - exact replica of desktop/src/ui/filter-mode-toggle.tsx
'use client';

import { Files, FileCheck } from "lucide-react";
import { DesktopButton } from "./DesktopButton";

export type FilterMode = "all" | "selected";

interface DesktopFilterModeToggleProps {
  currentMode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
  disabled?: boolean;
  includedCount?: number;
  totalCount?: number;
}

export function DesktopFilterModeToggle({
  currentMode,
  onModeChange,
  disabled = false,
  includedCount = 0,
  totalCount = 0,
}: DesktopFilterModeToggleProps) {
  return (
    <div className="flex items-center border border-border/50 rounded-lg overflow-hidden">
      <DesktopButton
        variant={currentMode === "all" ? "filter-active" : "filter"}
        size="xs"
        className="px-3 h-9"
        onClick={() => onModeChange("all")}
        disabled={disabled}
        title={`Show all ${totalCount} project files`}
      >
        <Files className="h-3.5 w-3.5 mr-1.5" />
        All{totalCount > 0 ? ` (${totalCount})` : ""}
      </DesktopButton>

      <div className="w-[1px] h-6 bg-border/40" />

      <DesktopButton
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
      </DesktopButton>
    </div>
  );
}
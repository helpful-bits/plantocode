"use client";

import { Replace, Plus } from "lucide-react";

import { Button } from "@/ui/button";

interface FindModeToggleProps {
  currentMode: "replace" | "extend";
  onModeChange: (mode: "replace" | "extend") => void;
  disabled?: boolean;
}

const FindModeToggle = ({
  currentMode,
  onModeChange,
  disabled = false,
}: FindModeToggleProps) => {
  return (
    <div className="flex items-center border border-border/60 rounded-lg overflow-hidden shadow-soft backdrop-blur-sm bg-background/80">
      <Button
        variant={currentMode === "extend" ? "filter-active" : "filter"}
        size="xs"
        className="px-3"
        onClick={() => onModeChange("extend")}
        disabled={disabled}
        title="Add AI-found files to your existing selection"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Extend
      </Button>

      <div className="w-[1px] h-6 bg-border/40" />

      <Button
        variant={currentMode === "replace" ? "filter-active" : "filter"}
        size="xs"
        className="px-3"
        onClick={() => onModeChange("replace")}
        disabled={disabled}
        title="Replace your current selection with AI-found files"
      >
        <Replace className="h-3.5 w-3.5 mr-1.5" />
        Replace
      </Button>
    </div>
  );
};

FindModeToggle.displayName = "FindModeToggle";

export default FindModeToggle;

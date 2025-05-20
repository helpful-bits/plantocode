"use client";

import { Replace, Plus } from "lucide-react";


import { Button } from "@/ui/button";
import { cn } from "@/utils/utils";

import type React from "react";

interface FindModeToggleProps {
  currentMode: "replace" | "extend";
  onModeChange: (mode: "replace" | "extend") => void;
  disabled?: boolean;
}

const FindModeToggle: React.FC<FindModeToggleProps> = ({
  currentMode,
  onModeChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-center border rounded-md overflow-hidden dark:border-border">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-none border-0 h-8 px-3",
          currentMode === "extend"
            ? "bg-primary/10 text-primary font-medium dark:bg-primary/20 dark:text-primary-foreground"
            : "text-muted-foreground dark:text-muted-foreground/90"
        )}
        onClick={() => onModeChange("extend")}
        disabled={disabled}
        title="Add AI-found files to your existing selection"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Extend
      </Button>

      <div className="w-[1px] h-6 bg-border dark:bg-border" />

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "rounded-none border-0 h-8 px-3",
          currentMode === "replace"
            ? "bg-primary/10 text-primary font-medium dark:bg-primary/20 dark:text-primary-foreground"
            : "text-muted-foreground dark:text-muted-foreground/90"
        )}
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

export default FindModeToggle;

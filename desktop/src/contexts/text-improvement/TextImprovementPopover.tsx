"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/ui/button";
import { useTextImprovementContext } from "./TextImprovementProvider";

export function TextImprovementPopover() {
  const { isVisible, position, isImproving, triggerImprovement } = useTextImprovementContext();

  if (!isVisible) {
    return null;
  }

  return (
    <div
      data-text-improvement-popover
      className="fixed z-50 p-1"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={triggerImprovement}
        isLoading={isImproving}
        disabled={isImproving}
        className="h-7 w-7 p-0 bg-card/90 hover:bg-card border border-border/50 backdrop-blur-sm"
        title="Improve text"
      >
        <Sparkles className="h-3 w-3 text-foreground" />
      </Button>
    </div>
  );
}
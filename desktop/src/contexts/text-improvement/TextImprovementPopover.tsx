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
      className="fixed z-[350] p-1 pointer-events-auto"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onMouseDown={(e) => e.preventDefault()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={triggerImprovement}
        isLoading={isImproving}
        disabled={isImproving}
        className="h-7 w-7 p-0 bg-card/90 hover:bg-card border border-border/50 backdrop-blur-sm cursor-pointer"
        title="Improve text"
      >
        <Sparkles className="h-3 w-3 text-foreground" />
      </Button>
    </div>
  );
}
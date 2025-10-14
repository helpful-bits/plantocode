"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/ui/button";
import { useTextImprovementContext } from "./TextImprovementProvider";

export function TextImprovementPopover() {
  const { isVisible, position, isImproving, isRefining, triggerImprovement, triggerRefinement } = useTextImprovementContext();

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
      onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDownCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseUpCapture={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex flex-row items-center gap-1">
        <Button
          type="button"
          title="Improve text"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerImprovement}
          disabled={isImproving}
          className="h-7 w-7 p-0 bg-card/90 hover:bg-card border border-border/50 backdrop-blur-sm text-muted-foreground hover:bg-muted/40 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-gray-500" />
        </Button>
        <Button
          type="button"
          title="Refine task"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerRefinement}
          disabled={isRefining}
          className="h-7 w-7 p-0 bg-card/90 hover:bg-card border border-border/50 backdrop-blur-sm hover:bg-purple-50 cursor-pointer"
        >
          <Sparkles className="h-4 w-4 text-purple-600" />
        </Button>
      </div>
    </div>
  );
}
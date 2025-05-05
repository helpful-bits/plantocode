"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionSwitchOverlayProps {
  isLoading: boolean;
}

export default function SessionSwitchOverlay({ isLoading }: SessionSwitchOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      className={cn(
        "fixed top-2 right-2 z-50",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      )}
    >
      <div className="bg-background/95 border rounded-md px-3 py-1.5 shadow-sm flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-xs">Switching session...</p>
      </div>
    </div>
  );
}
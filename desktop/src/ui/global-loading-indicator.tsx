"use client";

import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface GlobalLoadingIndicatorProps {
  isLoading: boolean;
  message?: string | null;
}

/**
 * GlobalLoadingIndicator
 *
 * A non-invasive loading indicator that appears at the top of the page.
 * - Uses a thin progress bar at the top of the page
 * - Has a fade-in/out animation to avoid abrupt appearance/disappearance
 * - Shows contextual loading messages in a floating toast
 */
export function GlobalLoadingIndicator({
  isLoading,
  message,
}: GlobalLoadingIndicatorProps) {
  // Delay hiding the indicator to provide a smoother transition
  const [isVisible, setIsVisible] = useState(isLoading);

  // Control visibility with a small delay for hide to prevent flickering
  // Show immediately, hide with delay
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    if (isLoading) {
      setIsVisible(true);
    } else {
      // Delay hiding by 500ms to ensure smooth transition
      timeout = setTimeout(() => setIsVisible(false), 500);
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [isLoading]);

  // Don't render anything if not visible
  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transition-opacity duration-300 ${isLoading ? "opacity-100" : "opacity-0"}`}
    >
      {/* Subtle progress bar at the top */}
      <div className="h-0.5 w-full bg-background/20">
        <div className="h-full bg-primary/70 animate-progress-indeterminate"></div>
      </div>

      {/* Floating message toast */}
      {message && (
        <div className="absolute top-2 right-4 flex items-center gap-2 py-1 px-2.5 bg-card/90 backdrop-blur-sm shadow-sm rounded-md border border-border/30 text-xs font-medium transition-all duration-300 ease-in-out">
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
          <span className="text-foreground/90">{message}</span>
        </div>
      )}
    </div>
  );
}

export default GlobalLoadingIndicator;

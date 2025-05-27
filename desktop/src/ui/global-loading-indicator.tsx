"use client";

import { useState, useEffect, useRef } from "react";

interface GlobalLoadingIndicatorProps {
  isLoading: boolean;
}

/**
 * GlobalLoadingIndicator
 *
 * A non-invasive loading indicator that appears at the top of the page.
 * - Uses a thin progress bar at the top of the page
 * - Has a fade-in/out animation to avoid abrupt appearance/disappearance
 */
export function GlobalLoadingIndicator({
  isLoading,
}: GlobalLoadingIndicatorProps) {
  // Delay hiding the indicator to provide a smoother transition
  const [isVisible, setIsVisible] = useState(isLoading);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null); // Ref for timeout

  // Control visibility with a small delay for hide to prevent flickering
  // Show immediately, hide with delay
  useEffect(() => {
    if (isLoading) {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current); // Clear pending hide timeout
        timeoutIdRef.current = null;
      }
      setIsVisible(true);
    } else {
      timeoutIdRef.current = setTimeout(() => {
        setIsVisible(false);
        timeoutIdRef.current = null;
      }, 500); // Delay hiding
    }

    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current); // Cleanup on unmount or re-run
      }
    };
  }, [isLoading]);

  // Don't render anything if not visible
  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 transition-opacity duration-300 ${isVisible && isLoading ? "opacity-100" : "opacity-0"}`}
    >
      {/* Subtle progress bar at the top */}
      <div className="h-0.5 w-full bg-background/90 backdrop-blur-sm shadow-soft">
        <div className="h-full bg-primary animate-progress-indeterminate"></div>
      </div>

    </div>
  );
}

export default GlobalLoadingIndicator;
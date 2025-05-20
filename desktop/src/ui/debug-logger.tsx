"use client";

import { useEffect } from "react";

interface DebugLoggerProps {
  componentName: string;
  stage?: string;
}

/**
 * A simple component to log when it's rendered - helps trace initialization issues
 */
export function DebugLogger({
  componentName,
  stage = "mount",
}: DebugLoggerProps) {
  useEffect(() => {
    // Log is intentionally used for debugging
    return () => {
      // Cleanup log is intentionally used for debugging
    };
  }, [componentName, stage]);

  return null;
}

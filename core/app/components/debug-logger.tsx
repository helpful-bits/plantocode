"use client";

import { useEffect } from 'react';

interface DebugLoggerProps {
  componentName: string;
  stage?: string;
}

/**
 * A simple component to log when it's rendered - helps trace initialization issues
 */
export function DebugLogger({ componentName, stage = "mount" }: DebugLoggerProps) {
  useEffect(() => {
    console.log(`[Debug] ${componentName} - ${stage} at ${new Date().toISOString()}`);
    return () => console.log(`[Debug] ${componentName} - unmount at ${new Date().toISOString()}`);
  }, [componentName, stage]);
  
  return null;
}
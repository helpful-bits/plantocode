"use client";

import React from 'react';

/**
 * A minimal loading screen shown during the critical initial app loading phase.
 * Uses bare minimum HTML and CSS to avoid any potential performance impact.
 */
export function AppInitializingScreen() {
  return (
    <div
      className="fixed inset-0 bg-background flex flex-col items-center justify-center z-50"
    >
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      <p className="mt-5 text-foreground/70 text-sm">Loading...</p>
    </div>
  );
}
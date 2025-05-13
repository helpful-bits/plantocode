"use client";

import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

/**
 * Simple loading screen that displays during app initialization
 * Avoids complex components that might trigger the freeze
 */
export function LoadingScreen({ message = "Loading..." }: LoadingScreenProps) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
      <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin mb-4"></div>
      <p className="text-foreground/70 text-lg">{message}</p>
    </div>
  );
}
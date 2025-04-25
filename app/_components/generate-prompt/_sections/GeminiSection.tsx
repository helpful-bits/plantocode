"use client";

import React, { Suspense, useEffect } from "react";
import { GeminiProcessor } from '@/app/_components/gemini-processor/gemini-processor';
import { GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';

interface GeminiSectionProps {
  state: {
    prompt: string;
    activeSessionId: string | null;
    projectDirectory: string;
    sessionInitialized: boolean;
    diffTemperature: number;
    modelUsed: string;
  };
}

export default function GeminiSection({ state }: GeminiSectionProps) {
  const { prompt, activeSessionId, projectDirectory, sessionInitialized, diffTemperature, modelUsed } = state;
  
  // Store activeSessionId in sessionStorage when it changes
  useEffect(() => {
    if (activeSessionId) {
      sessionStorage.setItem('activeSessionId', activeSessionId);
    }
  }, [activeSessionId]);
  
  // Only render when all required props are available
  if (!activeSessionId || !projectDirectory || !sessionInitialized || !prompt) {
    return null;
  }

  return (
    <Suspense fallback={<div>Loading Gemini Processor...</div>}>
      <GeminiProcessor 
        prompt={prompt}
        model={modelUsed}
        temperature={diffTemperature} 
      />
    </Suspense>
  );
} 
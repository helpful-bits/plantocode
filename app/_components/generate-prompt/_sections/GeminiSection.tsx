"use client";

import React, { Suspense } from "react";
import { GeminiProcessor } from '@/app/_components/gemini-processor/gemini-processor';
import { GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';

interface GeminiSectionProps {
  state: {
    prompt: string;
    activeSessionId: string | null;
    projectDirectory: string;
    sessionInitialized: boolean;
    diffTemperature: number;
  };
}

export default function GeminiSection({ state }: GeminiSectionProps) {
  const { prompt, activeSessionId, projectDirectory, sessionInitialized, diffTemperature } = state;
  
  // Only render when all required props are available
  if (!activeSessionId || !projectDirectory || !sessionInitialized || !prompt) {
    return null;
  }

  return (
    <Suspense fallback={<div>Loading Gemini Processor...</div>}>
      <GeminiProcessor 
        prompt={prompt} 
        activeSessionId={activeSessionId} 
        model={GEMINI_PRO_PREVIEW_MODEL} 
        temperature={diffTemperature} 
      />
    </Suspense>
  );
} 
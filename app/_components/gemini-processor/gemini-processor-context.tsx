"use client";

import React, { createContext, useContext, useMemo, useCallback, ReactNode } from 'react';

// Define the context type
export interface GeminiProcessorContextType {
  resetProcessorState: () => Promise<void>;
}

// Create the context with a default value
export const GeminiProcessorContext = createContext<GeminiProcessorContextType>({
  resetProcessorState: async () => { 
    console.warn("resetProcessorState called outside of GeminiProcessorProvider");
  }
});

// Custom hook to use the context
export const useGeminiProcessor = () => useContext(GeminiProcessorContext);

// Provider component (though functionality is managed within GeminiProcessor itself)
export function GeminiProcessorProvider({ children }: { children: ReactNode }) {
  // The actual implementation of resetProcessorState is within GeminiProcessor.
  // This provider simply makes the context available. We pass a dummy value here.
  const value = useMemo(() => ({
    resetProcessorState: async () => {} // Dummy function, real one provided by GeminiProcessor
  }), []);
  return <GeminiProcessorContext.Provider value={value}>{children}</GeminiProcessorContext.Provider>;
}

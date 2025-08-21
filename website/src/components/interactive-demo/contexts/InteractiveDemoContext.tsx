'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface InteractiveDemoState {
  textEnhancementState: 'idle' | 'text-selected' | 'processing' | 'completed';
  videoRecordingState: 'idle' | 'dialog-open' | 'capturing' | 'recording' | 'stopping' | 'completed';
  deepResearchState: 'idle' | 'ready' | 'processing' | 'completed';
  fileSearchState: 'idle' | 'searching' | 'ai-finding-regex' | 'ai-finding-relevance' | 'ai-finding-path' | 'ai-finding-correction' | 'results-shown';
}

interface InteractiveDemoContextType extends InteractiveDemoState {
  setTextEnhancementState: (state: InteractiveDemoState['textEnhancementState']) => void;
  setVideoRecordingState: (state: InteractiveDemoState['videoRecordingState']) => void;
  setDeepResearchState: (state: InteractiveDemoState['deepResearchState']) => void;
  setFileSearchState: (state: InteractiveDemoState['fileSearchState']) => void;
}

const InteractiveDemoContext = createContext<InteractiveDemoContextType | undefined>(undefined);

interface InteractiveDemoProviderProps {
  children: ReactNode;
}

export function InteractiveDemoProvider({ children }: InteractiveDemoProviderProps) {
  const [textEnhancementState, setTextEnhancementState] = useState<InteractiveDemoState['textEnhancementState']>('idle');
  const [videoRecordingState, setVideoRecordingState] = useState<InteractiveDemoState['videoRecordingState']>('idle');
  const [deepResearchState, setDeepResearchState] = useState<InteractiveDemoState['deepResearchState']>('idle');
  const [fileSearchState, setFileSearchState] = useState<InteractiveDemoState['fileSearchState']>('idle');

  return (
    <InteractiveDemoContext.Provider
      value={{
        textEnhancementState,
        videoRecordingState,
        deepResearchState,
        fileSearchState,
        setTextEnhancementState,
        setVideoRecordingState,
        setDeepResearchState,
        setFileSearchState,
      }}
    >
      {children}
    </InteractiveDemoContext.Provider>
  );
}

export function useInteractiveDemoContext() {
  const context = useContext(InteractiveDemoContext);
  if (context === undefined) {
    throw new Error('useInteractiveDemoContext must be used within an InteractiveDemoProvider');
  }
  return context;
}
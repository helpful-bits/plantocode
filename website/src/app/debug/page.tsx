'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ArrowRight } from 'lucide-react';

// Import all step components for debugging
import { 
  ProjectSelectorMock,
  SessionManagerMock, 
  TaskDescriptionMock,
  VoiceTranscriptionMock,
  VideoRecordingMock,
  TextImprovementMock,
  DeepResearchMock,
  FileSearchMock,
  PlanCardsStreamMock,
  MergeInstructionsMock,
  SettingsMock,
  CopyButtonsMock
} from '@/components/interactive-demo/steps';
import { InteractiveDemoProvider } from '@/components/interactive-demo/contexts/InteractiveDemoContext';

const STEPS = [
  { id: 1, title: "Project Selection", Component: ProjectSelectorMock },
  { id: 2, title: "Session Management", Component: SessionManagerMock },
  { id: 3, title: "Task Description", Component: TaskDescriptionMock },
  { id: 4, title: "Voice Transcription", Component: VoiceTranscriptionMock },
  { id: 5, title: "Text Enhancement", Component: TextImprovementMock },
  { id: 6, title: "Video Recording", Component: VideoRecordingMock },
  { id: 7, title: "Deep Research", Component: DeepResearchMock },
  { id: 8, title: "File Search", Component: FileSearchMock },
  { id: 9, title: "Implementation Plans", Component: PlanCardsStreamMock },
  { id: 10, title: "Plan Selection & Merge Instructions", Component: MergeInstructionsMock },
  { id: 11, title: "Settings Configuration", Component: SettingsMock },
  { id: 12, title: "Export & Copy", Component: CopyButtonsMock }
];

export default function DebugPage() {
  const [selectedStepId, setSelectedStepId] = useState(4); // Start with Voice Transcription
  const [resetKey, setResetKey] = useState(0); // Stable reset key
  const [autoRestart, setAutoRestart] = useState(false); // Auto-restart toggle
  const [simulateScroll, setSimulateScroll] = useState(false); // Simulate scroll behavior
  const [isInView, setIsInView] = useState(true); // Simulated isInView state
  const selectedStep = STEPS.find(step => step.id === selectedStepId);

  // Auto-restart timer for static components (resetKey method)
  React.useEffect(() => {
    if (!autoRestart || simulateScroll) return; // Don't conflict with scroll simulation
    
    const interval = setInterval(() => {
      setResetKey(prev => prev + 1);
    }, 5000); // Restart every 5 seconds
    
    return () => clearInterval(interval);
  }, [autoRestart, simulateScroll]);

  // Simulate scroll behavior by toggling isInView
  React.useEffect(() => {
    if (!simulateScroll) {
      setIsInView(true); // Always visible when not simulating
      return;
    }
    
    const interval = setInterval(() => {
      setIsInView(false); // Go out of view
      setTimeout(() => {
        setIsInView(true); // Come back into view (triggers restart)
      }, 200); // Brief out-of-view period
    }, 4000); // Cycle every 4 seconds
    
    return () => clearInterval(interval);
  }, [simulateScroll]);

  return (
    <InteractiveDemoProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-4">
              <Link 
                href="/"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to Home
              </Link>
              <div className="h-4 w-px bg-border" />
              <h1 className="text-xl font-semibold">Interactive Demo Debug</h1>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Step Selector Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-xl border p-4 sticky top-8">
                <h2 className="font-semibold mb-4">Select Step</h2>
                <div className="space-y-2">
                  {STEPS.map((step) => (
                    <button
                      key={step.id}
                      onClick={() => {
                        setSelectedStepId(step.id);
                        setResetKey(prev => prev + 1); // Increment reset key to restart animation
                      }}
                      className={`w-full text-left p-3 rounded-lg transition-all flex items-center justify-between group ${
                        selectedStepId === step.id
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-md text-xs font-mono flex items-center justify-center ${
                          selectedStepId === step.id
                            ? 'bg-primary-foreground/20 text-primary-foreground'
                            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
                        }`}>
                          {step.id}
                        </span>
                        <span className="text-sm font-medium truncate">{step.title}</span>
                      </div>
                      {selectedStepId === step.id && (
                        <ArrowRight className="h-3 w-3 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Step Display */}
            <div className="lg:col-span-3">
              {selectedStep && (
                <div className="bg-card rounded-xl border overflow-hidden">
                  {/* Step Header */}
                  <div className="bg-primary/5 border-b border-primary/10 px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/20 border border-primary/30 text-primary font-bold">
                          {selectedStep.id}
                        </span>
                        <div>
                          <h3 className="text-xl font-bold text-foreground">{selectedStep.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            Debug view - component will loop continuously while visible
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={simulateScroll}
                            onChange={(e) => {
                              setSimulateScroll(e.target.checked);
                              if (e.target.checked) setAutoRestart(false); // Disable auto-restart when simulating scroll
                            }}
                            className="w-4 h-4 text-primary bg-background border border-muted rounded focus:ring-primary focus:ring-2"
                          />
                          <span className="text-muted-foreground">Simulate scroll (4s)</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={autoRestart && !simulateScroll}
                            disabled={simulateScroll}
                            onChange={(e) => setAutoRestart(e.target.checked)}
                            className="w-4 h-4 text-primary bg-background border border-muted rounded focus:ring-primary focus:ring-2 disabled:opacity-50"
                          />
                          <span className="text-muted-foreground">Auto-restart (5s)</span>
                        </label>
                        <button
                          onClick={() => setResetKey(prev => prev + 1)}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium flex items-center gap-2"
                          title="Restart animation manually"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Restart
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Step Content */}
                  <div className="p-6">
                    <selectedStep.Component 
                      key={selectedStepId} // Force re-render when switching steps
                      isInView={isInView} 
                      resetKey={resetKey}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </InteractiveDemoProvider>
  );
}
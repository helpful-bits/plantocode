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
  SystemPromptMock,
  CopyButtonsMock,
  ModelSelectorToggleMock
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
  { id: 12, title: "System Prompts", Component: SystemPromptMock },
  { id: 13, title: "Export & Copy", Component: CopyButtonsMock },
  { id: 14, title: "Model Selection", Component: ModelSelectorToggleMock }
];

export default function DebugPage() {
  const [selectedStepId, setSelectedStepId] = useState(4); // Start with Voice Transcription
  const [resetKey, setResetKey] = useState(0); // Stable reset key
  const selectedStep = STEPS.find(step => step.id === selectedStepId);

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
                  </div>
                  
                  {/* Step Content */}
                  <div className="p-6">
                    <selectedStep.Component 
                      key={selectedStepId} // Force re-render when switching steps
                      isInView={true} 
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
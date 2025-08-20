/**
 * HowItWorksInteractive - Ultra-simplified interactive demo
 * Zero conditional rendering, zero lazy mounting, zero complexity
 * 
 * ACCEPTANCE CRITERIA (verbatim from UI parity plan):
 * - UI Accuracy (global): All demo elements must visually match desktop UI using identical class tokens.
 * - Component Integration:
 *   • Step 6 (Video Recording): Root wrapper exposes data-video-recording-state ∈ {idle, dialog-open, capturing, recording, stopping, completed}. Sidebar shows a single "Video Analysis" job mapping to queued (idle/dialog-open/capturing/recording) → running (stopping) → completed (completed). No modal for this step. Global Recording Indicator visible during recording/stopping.
 *   • Step 7 (Deep Research): Auto-open Job Details modal when progress ≥ 0.8 showing complete list of generated prompts with copy buttons; Sidebar reflects "Deep Research" job states similarly via data-deep-research-state ∈ {idle, ready, processing, completed}.
 *   • File Finding Flow: Show Sidebar jobs in exact order and group with dashed connectors: regex_file_filter → file_relevance_assessment → extended_path_finder → path_correction. No modal here.
 * - Editor Parity:
 *   • Implementation Plans (list) and Plan Content (modal/inline) must match desktop card and modal hierarchy, status strip, headers, progress, code viewer header, and copy affordances.
 *   • System Prompts: Two-tab header (Default/Custom), code viewer header with label and counters, identical spacing/typography.
 * 
 * HTML/COMPONENT MAPPING (for maintainers; embed in the same comment):
 * - Dialogs: Desktop ui/dialog.tsx → Website DesktopDialog
 *   Structure: Dialog → DialogContent → DialogHeader → body → DialogFooter
 * - Cards: Desktop ui/card.tsx → Website DesktopCard (+ Header/Title/Description/Content)
 * - Progress: Desktop ui/progress.tsx → Website DesktopProgress (transform-based indicator)
 * - Tabs: Desktop ui/tabs.tsx → Website DesktopTabs
 * - Code Viewer: Desktop ui/virtualized-code-viewer.tsx → Website DesktopCodeViewer (presentational)
 * 
 * STYLE TOKEN SOURCES:
 * - desktop/src/app/globals.css and desktop/public/base.css → website/src/styles/desktop-compat.css (copy only the listed classes in Step 3).
 * 
 * VISUAL QA CHECKLIST:
 * • Step 6: Dictation toggle shows Audio Device; FPS min/max labels; red pulse dot during recording; Sidebar queued→running (stopping)→completed mapping correct; no modal.
 * • Step 7: Modal opens at ≥0.8; three+ prompts each with Copy; tokens match bg-card/border-border/shadow-soft-md.
 * • File Finding: Order exact; dashed connectors visible; group header shown; no modal.
 * • Plans: Cards show status strip; modal/inline content show header+progress+viewer; copy controls present; mono/footer metrics correct.
 * • System Prompts: Tabs and viewer header match desktop; helper line present.
 */
'use client';

import React from 'react';
import { StepController } from './StepController';
import { ScrollToNextArrow } from './ScrollToNextArrow';
import './interactive-demo.css';
import { InteractiveDemoProvider } from './contexts/InteractiveDemoContext';

// Import all step components
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
  ModelSelectorToggleMock,
  SidebarJobsMock
} from './steps';

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

export function HowItWorksInteractive() {

  return (
    <InteractiveDemoProvider>
      <div className="relative flex flex-col lg:flex-row gap-8">
        {/* Left: main steps list */}
        <div className="flex-1">
          <div className="interactive-demo-container max-w-4xl mx-auto px-0 sm:px-4 space-y-16">
            {STEPS.map(({ id, title, Component }, index) => (
              <StepController key={id} className="min-h-[60vh] py-8">
                {({ isInView, progress }) => (
                  <div className="space-y-4">
                    <div 
                      className="desktop-glass border border-primary/20 hover:border-primary/30 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02]"
                      data-step={id}
                    >
                      {/* Header with step number and title - number to the left */}
                      <div className="bg-primary/5 border-b border-primary/10 px-0 sm:px-6 py-5">
                        <div className="flex items-center justify-center gap-4">
                          <span className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 text-primary font-bold text-lg shadow-sm">
                            {id}
                          </span>
                          <h3 className="text-2xl font-bold text-foreground tracking-tight">{title}</h3>
                        </div>
                      </div>
                      
                      {/* Content */}
                      <div className={[8, 9, 10].includes(id) ? "p-[2px] sm:p-6" : "p-6"}>
                        <Component isInView={isInView} progress={progress} />
                      </div>
                    </div>
                    
                    {/* Arrow attached to this card (shown when step is complete) */}
                    {index < STEPS.length - 1 && progress > 0.7 && (
                      <ScrollToNextArrow 
                        nextStepId={STEPS[index + 1]?.id ?? 1}
                        label="Next Step"
                        isVisible={true}
                      />
                    )}
                  </div>
                )}
              </StepController>
            ))}
          </div>
        </div>
        
        {/* Right: Sidebar */}
        <div className="w-full lg:w-[400px] lg:sticky top-24 h-full">
          <SidebarJobsMock isInView={true} progress={1} />
        </div>
      </div>
    </InteractiveDemoProvider>
  );
}

export default HowItWorksInteractive;
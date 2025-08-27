/**
 * Interactive Demo Acceptance Criteria:
 * - All demo cards use the "desktop-glass-card" frosted effect by default (DesktopCard/JobCard)
 * - Animations loop while in view and pause off-screen (active: isInView, resetOnDeactivate: true), with stabilized observer thresholds
 * - Pacing increased across Voice Transcription, Text Enhancement, Video Recording, File Search, Session Manager, Project Selector
 * - Project Selector success message persists for the remainder of the in-view loop
 * - File Search checkboxes match the desktop visually and animate check/uncheck; no overlap with file icons
 * - Task Description content persists across reloads; Undo/Redo have clear pressed feedback
 * - Text Enhancement shows a selection/highlight state after enhancement completes
 * - Mobile presentation remains optimized (e.g., File Search); widths adjusted to avoid overlap
 */

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
import dynamic from 'next/dynamic';
import { StepController } from './StepController';

// Initialize Monaco Editor workers
import '../../monaco-workers';
import { ScrollToNextArrow } from './ScrollToNextArrow';
import { StepErrorBoundary } from './StepErrorBoundary';
import './interactive-demo.css';
import { InteractiveDemoProvider } from './contexts/InteractiveDemoContext';

// Lazy-load all step components
const ProjectSelectorMock = dynamic(() => import('./steps').then(m => ({ default: m.ProjectSelectorMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const SessionManagerMock = dynamic(() => import('./steps').then(m => ({ default: m.SessionManagerMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const TaskDescriptionMock = dynamic(() => import('./steps').then(m => ({ default: m.TaskDescriptionMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const VoiceTranscriptionMock = dynamic(() => import('./steps').then(m => ({ default: m.VoiceTranscriptionMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const VideoRecordingMock = dynamic(() => import('./steps').then(m => ({ default: m.VideoRecordingMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const TextImprovementMock = dynamic(() => import('./steps').then(m => ({ default: m.TextImprovementMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const DeepResearchMock = dynamic(() => import('./steps').then(m => ({ default: m.DeepResearchMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const FileSearchMock = dynamic(() => import('./steps').then(m => ({ default: m.FileSearchMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const PlanCardsStreamMock = dynamic(() => import('./steps').then(m => ({ default: m.PlanCardsStreamMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const MergeInstructionsMock = dynamic(() => import('./steps').then(m => ({ default: m.MergeInstructionsMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const SettingsMock = dynamic(() => import('./steps').then(m => ({ default: m.SettingsMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});

const CopyButtonsMock = dynamic(() => import('./steps').then(m => ({ default: m.CopyButtonsMock })), { 
  ssr: false, 
  loading: () => <div className="h-16" /> 
});


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

export function HowItWorksInteractive() {

  /* Step 22: Final timing harmonization
   * Suggested durations for maintainers (timing handled within each step):
   * - Simple form interactions: ~8-14 seconds with 1-2s idle
   * - Complex workflows (Deep Research, File Search): ~15-20 seconds
   * - Text streaming/typing: ~3-5 seconds per paragraph
   * - Button interactions: 200-500ms pulse/press
   * - Multi-phase cycles: Include 800-1200ms wait between cycles
   * - No global timeline - each component maintains independent timing
   */

  return (
    <InteractiveDemoProvider>
      <div className="relative">
        {/* Main steps list */}
        <div className="interactive-demo-container max-w-4xl mx-auto px-0 sm:px-4 space-y-[250px] sm:space-y-[300px] lg:space-y-[450px]">
          {STEPS.map(({ id, title, Component }, index) => (
            <StepController key={id} className="py-4" stepName={title}>
              {({ isInView, resetKey }) => (
                <div className="space-y-4">
                  <div 
                    className="desktop-glass-card border border-primary/20 hover:border-primary/30 rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02]"
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
                      <StepErrorBoundary 
                        stepId={id} 
                        stepTitle={title}
                        onError={(stepId, error) => console.error(`Step ${stepId} failed:`, error)}
                      >
                        <Component key={resetKey} isInView={isInView} resetKey={resetKey} />
                      </StepErrorBoundary>
                    </div>
                  </div>
                  
                  {/* Arrow attached to this card (shown when step is visible) */}
                  {index < STEPS.length - 1 && isInView && (
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
    </InteractiveDemoProvider>
  );
}

export default HowItWorksInteractive;
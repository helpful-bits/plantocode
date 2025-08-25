/* Desktop Parity Mapping:
 * Sources: desktop/src/app/components/generate-prompt/_components/video-recording-dialog.tsx; desktop/src/ui/button.tsx, select.tsx, slider.tsx, checkbox.tsx, textarea.tsx
 * Classes: sm:max-w-[500px], text-muted-foreground, min-h-[150px], font-mono, bg-muted/50, border, rounded, hover:bg-primary/10, focus-ring
 * Structure: Dialog → Header → body (textarea, checkbox+select, slider+help) → Footer
 */
// Step 6: Video Recording Mock - Progress-driven state
'use client';

import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { DesktopCheckbox } from '../desktop-ui/DesktopCheckbox';
import { DesktopSlider } from '../desktop-ui/DesktopSlider';
import { DesktopSelect, DesktopSelectOption } from '../desktop-ui/DesktopSelect';
import { DesktopProgress } from '../desktop-ui/DesktopProgress';
import { DesktopBadge } from '../desktop-ui/DesktopBadge';
import { Mic, Undo2, Redo2, Square, Video, CheckCircle, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';
import { useTimedCycle, useTweenNumber } from '../hooks';

interface VideoRecordingMockProps {
  isInView: boolean;
  resetKey?: number;
}

type RecordingState = 'idle' | 'dialog-open' | 'capturing' | 'recording' | 'stopping' | 'analyzing' | 'populating' | 'final';

const ANALYSIS_RESULT_TEXT = `<video_analysis_summary>
- The recording shows the user starting a screen capture and running automated analysis.
- A background task appears with a thin progress bar and live percentage updates (green-blue).
- When analysis completes, findings are automatically pasted into the Task Description field.
- Final UI displays the populated Task Description with no remaining recording controls.
</video_analysis_summary>`;

// Define phases outside component to prevent recreation on each render
const VIDEO_RECORDING_PHASES = [
  { name: 'idle' as const, durationMs: 800 },        // Brief initial state
  { name: 'dialog-open' as const, durationMs: 3000 }, // Time to see recording options (reduced from 4000ms)
  { name: 'capturing' as const, durationMs: 1000 },   // Quick capture start (reduced from 1500ms)
  { name: 'recording' as const, durationMs: 4000 },   // Active recording (reduced from 6000ms)
  { name: 'stopping' as const, durationMs: 1000 },    // Quick stop (reduced from 1500ms)
  { name: 'analyzing' as const, durationMs: 3500 },   // Analysis processing (reduced from 5000ms)
  { name: 'populating' as const, durationMs: 400 },   // Quick population (reduced from 500ms)
  { name: 'final' as const, durationMs: 2500 }        // Show final results (reduced from 99999 for demo)
];

export function VideoRecordingMock({ isInView }: VideoRecordingMockProps) {
  const { setVideoRecordingState } = useInteractiveDemoContext();
  const [frameRate, setFrameRate] = useState(15);
  const [recordAudio, setRecordAudio] = useState(false);
  const [audioDevice, setAudioDevice] = useState('default');
  const [analysisPrompt, setAnalysisPrompt] = useState('Analyze the user authentication flow and identify potential security vulnerabilities. Focus on JWT token handling, session management, and route protection patterns. Suggest specific improvements for better security and user experience.');
  const [taskText, setTaskText] = useState<string>('Record a walkthrough of the login process to analyze the authentication flow and identify any security issues or UX improvements.');

  const { phaseName: recordingState, phaseProgress01: phaseProgress } = useTimedCycle({
    active: isInView,
    phases: VIDEO_RECORDING_PHASES,
    loop: true,
    resetOnDeactivate: true
  });

  const { value: analysisProgress } = useTweenNumber({
    active: recordingState === 'analyzing',
    from: 0,
    to: 100,
    durationMs: 5000,
    loop: true
  });
  
  // Token streaming animation - simulate output tokens being generated
  const { value: outputTokens } = useTweenNumber({
    from: 2100, // Starting tokens
    to: 2956, // Final tokens (2100 + 856)
    active: recordingState === 'analyzing',
    durationMs: 3500, // Match analyzing duration
    loop: true
  });

  useEffect(() => {
    if (recordingState === 'recording' || recordingState === 'stopping' || recordingState === 'analyzing') {
      setVideoRecordingState?.('stopping'); // show "Running" in sidebar
    } else if (recordingState === 'populating' || recordingState === 'final') {
      setVideoRecordingState?.('completed');
    }
  }, [recordingState, setVideoRecordingState]);

  useEffect(() => {
    if (recordingState === 'populating' || recordingState === 'final') {
      // Append the analysis summary to the original task text, don't replace it
      const originalTask = 'Record a walkthrough of the login process to analyze the authentication flow and identify any security issues or UX improvements.';
      setTaskText(originalTask + '\n\n' + ANALYSIS_RESULT_TEXT);
    }
  }, [recordingState]);

  // Calculate recording time that ticks up smoothly during recording
  // Recording phase lasts 4000ms, so we'll show 0-15 seconds progression
  const recordingTime = recordingState === 'recording' 
    ? Math.floor(phaseProgress * 15) // Starts at 0, progresses to 14
    : recordingState === 'stopping' 
    ? 15 // Show final time during stopping
    : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full space-y-4" data-video-recording-state={recordingState}>
      {/* Task Section Card - exactly like desktop task-section.tsx */}
      <div className="rounded-lg p-5 bg-card shadow-sm w-full desktop-glass-card">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <label
                htmlFor="taskDescArea"
                className="font-semibold text-base sm:text-lg text-foreground"
              >
                Task Description
              </label>
              <span
                className={cn(
                  "text-xs bg-destructive/10 backdrop-blur-sm text-destructive px-2 py-0.5 rounded-md border border-destructive/20 transition-opacity",
                  taskText.trim() && "invisible"
                )}
              >
                Required
              </span>
              {/* Undo/Redo buttons next to the label */}
              <div className="flex items-center gap-1">
                <DesktopButton
                  compact
                  variant="outline"
                  size="xs"
                  className="transition-transform duration-200"
                  title="Undo last change"
                >
                  <Undo2 className="h-2.5 w-2.5" />
                </DesktopButton>
                <DesktopButton
                  compact
                  variant="outline"
                  size="xs"
                  className="transition-transform duration-200"
                  title="Redo undone change"
                >
                  <Redo2 className="h-2.5 w-2.5" />
                </DesktopButton>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
              <div className="h-6 w-[100px] px-2 text-sm border border-[oklch(0.90_0.04_195_/_0.5)] bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer flex items-center justify-between rounded">
                <span className="text-xs">English</span>
                <ChevronDown className="h-3 w-3" />
              </div>
              
              <div className="h-6 px-2 text-sm border border-[oklch(0.90_0.04_195_/_0.5)] bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer flex items-center justify-between rounded">
                <span className="text-xs">AirPods Max</span>
                <ChevronDown className="h-3 w-3 ml-1" />
              </div>

              {/* Voice Transcription Button */}
              <DesktopButton 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 hover:bg-primary/10 text-primary transition-transform duration-200" 
                title="Voice transcription"
              >
                <Mic className="h-4 w-4" />
              </DesktopButton>
              
              {/* Video Recording Button */}
              {recordingState !== 'recording' ? (
                <DesktopButton
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 hover:bg-primary/10 text-primary transition-transform duration-200"
                  title={(recordingState as RecordingState) === 'recording' ? "Recording in progress..." : "Record screen area"}
                >
                  {(recordingState === 'capturing' || recordingState === 'stopping') ? (
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </DesktopButton>
              ) : (
                <DesktopButton
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 hover:bg-destructive/10 text-destructive animate-pulse transition-transform duration-200"
                  title="Stop recording"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </DesktopButton>
              )}
            </div>
          </div>

          <div className="relative">
            <DesktopTextarea
              className={cn(
                "border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft min-h-[400px]",
                !taskText.trim() ? "border-destructive/20 bg-destructive/5" : "border-[oklch(0.90_0.04_195_/_0.5)]"
              )}
              value={taskText}
              onChange={() => {}} // Read-only in demo
              placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder below or type directly."
              readOnly
            />

            {!taskText.trim() && (
              <div className="text-xs text-destructive mt-1 pl-1">
                Please enter a task description to proceed
              </div>
            )}
            
            {(recordingState === 'recording' || recordingState === 'stopping') && (
              <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>{recordingState === 'recording' ? "Recording video..." : "Processing recording..."}</span>
                <DesktopButton
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                >
                  Cancel
                </DesktopButton>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recording Configuration - shows inline when dialog-open state */}
      {recordingState === 'dialog-open' && (
        <div className="mt-6 rounded-lg p-6 desktop-glass-card max-w-2xl mx-auto">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Record Screen for Analysis</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Optionally enter a prompt describing what you want to analyze in the recording.
                After clicking "Start Recording", select the area of your screen to record.
              </p>
            </div>
            
            {/* Analysis Prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Analysis Prompt (Optional)</label>
              <DesktopTextarea
                value={analysisPrompt}
                onChange={(e) => setAnalysisPrompt(e.target.value)}
                placeholder="e.g., Analyze the user interface and suggest improvements..."
                className="min-h-[150px] font-mono text-sm bg-background border border-[oklch(0.90_0.04_195_/_0.8)] rounded-lg shadow-sm"
              />
            </div>

            {/* Audio Recording Row */}
            <div className="flex items-center gap-2">
              <DesktopCheckbox
                id="record-audio"
                checked={recordAudio}
                onCheckedChange={(checked) => setRecordAudio(!!checked)}
              />
              <label
                htmlFor="record-audio"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground"
              >
                Include dictation
              </label>
              
              {recordAudio && (
                <div className="flex items-center space-x-2 ml-auto">
                  <label htmlFor="audio-device" className="text-sm">Audio Device</label>
                  <DesktopSelect value={audioDevice} onChange={setAudioDevice}>
                    <DesktopSelectOption value="default">Default - Built-in Microphone</DesktopSelectOption>
                    <DesktopSelectOption value="external">External USB Microphone</DesktopSelectOption>
                  </DesktopSelect>
                </div>
              )}
            </div>

            {/* Frame Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="frame-rate" className="text-sm font-medium">Frame Rate (FPS)</label>
                <span className="text-sm font-mono text-muted-foreground">{frameRate} FPS</span>
              </div>
              <DesktopSlider
                id="frame-rate"
                value={frameRate}
                min={5}
                max={24}
                step={1}
                onChange={setFrameRate}
                className="w-full"
                aria-label="Frame rate"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5 FPS</span>
                <span className="text-center">Higher frame rates may increase analysis costs</span>
                <span>24 FPS</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t border-[oklch(0.90_0.04_195_/_0.2)]">
              <DesktopButton variant="outline" aria-label="Cancel recording">
                Cancel
              </DesktopButton>
              <DesktopButton variant="default" className="bg-primary text-primary-foreground hover:bg-primary/90 border-0" aria-label="Start recording">
                Start Recording
              </DesktopButton>
            </div>
          </div>
        </div>
      )}

      {/* Global Recording Indicator - mirrors desktop GlobalRecordingIndicator */}
      {(recordingState === 'recording' || recordingState === 'stopping') && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-background border rounded-lg p-3 shadow-lg" aria-live="polite">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping opacity-75" />
            </div>
            <span className="text-sm font-medium">Recording</span>
          </div>
          
          <span className="text-sm font-mono text-muted-foreground">
            {formatTime(recordingTime)}
          </span>
          
          <DesktopButton
            variant="destructive"
            size="sm"
            className="flex items-center gap-1"
            aria-label="Stop recording"
          >
            <Square className="w-3 h-3" />
            Stop
          </DesktopButton>
        </div>
      )}

      {/* Capturing State - Screen Selection */}
      {recordingState === 'capturing' && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <div className="border rounded-xl bg-background p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Select screen area to record...</span>
            </div>
          </div>
        </div>
      )}

      {/* Video Analysis Job Card - EXACT match to desktop implementation */}
      {(recordingState === 'analyzing' || recordingState === 'populating' || recordingState === 'final') && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <div
            className={cn(
              "border border-border/60 bg-background/80 dark:bg-muted/30 p-2 rounded-lg text-xs text-foreground cursor-pointer transition-colors flex flex-col w-full max-w-[320px] overflow-hidden shadow-soft backdrop-blur-sm min-w-0"
            )}
            style={{
              minHeight: "140px",
            }}
            role="button"
            tabIndex={0}
          >
            {/* TOP ROW: Icon + Job Name + Badge | Close Button */}
            <div className="flex items-center justify-between mb-2 w-full min-w-0">
              <div className="flex items-center gap-2 font-medium min-w-0 flex-1">
                <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0">
                  {recordingState === 'final' ? (
                    <CheckCircle className="h-3 w-3 text-success" />
                  ) : recordingState === 'analyzing' ? (
                    <Loader2 className="h-3 w-3 text-primary animate-spin" />
                  ) : (
                    <Video className="h-3 w-3 text-info" />
                  )}
                </span>
                <span className="truncate text-foreground">
                  {recordingState === 'final' ? 'Video analyzed: screen_recording_20241201.webm' : 'Analyzing Video: screen_recording_20241201.webm'}
                </span>
                <DesktopBadge variant="outline" className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0">
                  Video Analysis
                </DesktopBadge>
              </div>
              <div className="w-6 h-6 flex-shrink-0">
                <DesktopButton
                  variant="ghost"
                  size="xs"
                  className="w-6 h-6 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Delete job"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </DesktopButton>
              </div>
            </div>

            {/* TIME ROW */}
            <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between">
              <span>{recordingState === 'analyzing' ? 'just now' : (recordingState === 'populating' || recordingState === 'final') ? 'just now' : 'just now'}</span>
            </div>

            {/* PROGRESS BAR (only for running jobs) */}
            {recordingState === 'analyzing' && (
              <div className="mt-2 mb-1">
                <DesktopProgress value={analysisProgress} className="h-1" />
                <div className="flex justify-between items-center min-w-0 overflow-hidden">
                  <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                    Processing video frames...
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                    {Math.round(analysisProgress)}%
                  </p>
                </div>
              </div>
            )}

            {/* TOKEN/MODEL INFO (for LLM tasks) */}
            <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px] w-full min-w-0">
              <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
                <span className="flex items-center gap-1 overflow-hidden min-w-0">
                  <span className="text-[9px] text-muted-foreground flex-shrink-0">Tokens:</span>
                  <span className="font-mono text-foreground text-[9px] flex-shrink-0">2.1K</span>
                  <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                  <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                    {recordingState === 'analyzing' ? Math.round(outputTokens - 2100) :
                     (recordingState === 'populating' || recordingState === 'final') ? '856' : '856'}
                  </span>
                </span>
                <span className="text-[9px] text-muted-foreground truncate max-w-full" title="google/gemini-2.5-pro">
                  google/gemini-2.5-pro
                </span>
              </div>
              <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                {recordingState === 'final' ? '45.2s' : '—'}
              </span>
            </div>

            {/* BOTTOM SECTION: Results + Cost */}
            <div className="flex-1 flex flex-col justify-end">
              <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                    <span className="font-medium text-foreground">
                      {recordingState === 'final' ? 'Video analyzed: screen_recording_20241201.webm' : 'Video analysis in progress'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-[9px] text-foreground">
                      {/* Only show cost after job completes */}
                      {recordingState === 'final' && '$0.024'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
export default VideoRecordingMock;


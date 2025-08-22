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
import { Mic, Undo2, Redo2, Square } from 'lucide-react';
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
  const [analysisPrompt, setAnalysisPrompt] = useState('');
  const [taskText, setTaskText] = useState<string>('');

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
    durationMs: 5000
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
      setTaskText(ANALYSIS_RESULT_TEXT);
    }
  }, [recordingState]);

  // Calculate recording time based on phase progress during recording phase
  const recordingTime = recordingState === 'recording' 
    ? Math.floor(phaseProgress * 60) // 60 seconds max recording time
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label
                htmlFor="taskDescArea"
                className="font-semibold text-lg text-foreground"
              >
                Task Description
              </label>
              <span
                className={cn(
                  "text-xs bg-destructive/10 backdrop-blur-sm text-destructive px-2 py-0.5 rounded-md border border-destructive/20",
                  taskText.trim() && "invisible"
                )}
              >
                Required
              </span>
              {/* Undo/Redo buttons next to the label */}
              <div className="flex items-center gap-1 ml-2">
                <DesktopButton
                  compact
                  variant="outline"
                  size="xs"
                  className="h-6 w-6"
                  title="Undo last change"
                >
                  <Undo2 className="h-3 w-3" />
                </DesktopButton>
                <DesktopButton
                  compact
                  variant="outline"
                  size="xs"
                  className="h-6 w-6"
                  title="Redo undone change"
                >
                  <Redo2 className="h-3 w-3" />
                </DesktopButton>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Voice Transcription Button */}
              <DesktopButton variant="ghost" size="sm" className="h-6 w-6 hover:bg-primary/10 text-primary" title="Voice transcription">
                <Mic className="h-4 w-4" />
              </DesktopButton>
              
              {/* Video Recording Button */}
              {recordingState !== 'recording' ? (
                <DesktopButton
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 hover:bg-primary/10 text-primary"
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
                  className="h-6 w-6 hover:bg-destructive/10 text-destructive animate-pulse"
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
                "border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 w-full resize-y font-normal shadow-soft min-h-[200px]",
                !taskText.trim() ? "border-destructive/20 bg-destructive/5" : "border-[oklch(0.90_0.04_195_/_0.5)]"
              )}
              value={taskText}
              onChange={() => {}} // Read-only in demo
              placeholder="Clearly describe the changes or features you want the AI to implement. You can use the voice recorder above or type directly."
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
        <div className="mt-6 rounded-lg p-6 desktop-glass-card">
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
                className="min-h-[150px] font-mono text-sm bg-muted/50 border rounded"
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
              <DesktopButton aria-label="Start recording">
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

      {/* Processing/Completed State */}
      {recordingState === 'analyzing' && (
        <div className="mt-4 rounded-md p-4 desktop-glass-card">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Analyzing video...</p>
            <p className="text-[10px] font-mono text-muted-foreground">{analysisProgress.toFixed(2)}%</p>
          </div>
          <div className="mt-2">
            <DesktopProgress className="h-1 w-full" value={analysisProgress} />
          </div>
        </div>
      )}

    </div>
  );
}
export default VideoRecordingMock;


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
import { Mic, Undo2, Redo2, Square } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useInteractiveDemoContext } from '../contexts/InteractiveDemoContext';

interface VideoRecordingMockProps {
  isInView: boolean;
  progress: number;
}

type RecordingState = 'idle' | 'dialog-open' | 'capturing' | 'recording' | 'stopping' | 'completed';

export function VideoRecordingMock({ isInView, progress }: VideoRecordingMockProps) {
  const { setVideoRecordingState } = useInteractiveDemoContext();
  const [frameRate, setFrameRate] = useState(15);
  const [recordAudio, setRecordAudio] = useState(false);
  const [audioDevice, setAudioDevice] = useState('default');
  const [analysisPrompt, setAnalysisPrompt] = useState('');
  const [taskText] = useState('I need to understand how user authentication works in this React application. Specifically, I want to analyze the login functionality and JWT token implementation, ensuring that routes are properly protected so users cannot access unauthorized content. Additionally, I want to verify that session management is working correctly and that security best practices are being followed throughout the application.');
  
  // Progress-driven state calculation
  const recordingState: RecordingState = (() => {
    if (!isInView) return 'idle';
    if (progress < 0.2) return 'idle';
    if (progress < 0.35) return 'dialog-open';
    if (progress < 0.45) return 'capturing';
    if (progress < 0.8) return 'recording';
    if (progress < 0.9) return 'stopping';
    return 'completed';
  })();

  // Publish state to context
  useEffect(() => {
    setVideoRecordingState(recordingState);
  }, [recordingState, setVideoRecordingState]);

  // Calculate recording time based on progress during recording phase
  const recordingTime = recordingState === 'recording' 
    ? Math.floor((progress - 0.45) / (0.8 - 0.45) * 35) // 35 seconds max recording time
    : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full space-y-4">
      {/* Task Section Card - exactly like desktop task-section.tsx */}
      <div className="border border-border/60 rounded-lg p-5 bg-card shadow-sm w-full">
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
                  variant="outline"
                  size="sm"
                  className="h-6 w-6"
                  title="Undo last change"
                >
                  <Undo2 className="h-3 w-3" />
                </DesktopButton>
                <DesktopButton
                  variant="outline"
                  size="sm"
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
                !taskText.trim() ? "border-destructive/20 bg-destructive/5" : "border-border/60"
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
        <div className="mt-6 border border-border/60 rounded-lg p-6 bg-card shadow-soft">
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
            <div className="flex justify-end gap-2 pt-4 border-t border-border/30">
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
      {recordingState === 'stopping' && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <div className="border rounded-xl bg-background p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Processing recording...</span>
            </div>
          </div>
        </div>
      )}

      {recordingState === 'completed' && (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
          <div className="border rounded-xl bg-background p-4 text-center">
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded-full" />
                <span className="text-sm font-medium text-foreground">Recording saved successfully</span>
              </div>
              <p className="text-xs text-muted-foreground">
                AI analysis will begin automatically in the background
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
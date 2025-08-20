// Step 4: Voice Transcription Mock
'use client';

import { DesktopButton } from '../desktop-ui/DesktopButton';
import { DesktopSelect, DesktopSelectOption } from '../desktop-ui/DesktopSelect';
import { DesktopTextarea } from '../desktop-ui/DesktopTextarea';
import { Mic, MicOff, Clock, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface VoiceTranscriptionMockProps {
  isInView: boolean;
  progress: number;
}

type RecordingState = 'idle' | 'starting' | 'recording' | 'processing' | 'transcribed';

export function VoiceTranscriptionMock({ isInView, progress }: VoiceTranscriptionMockProps) {
  const [languageCode, setLanguageCode] = useState('en-US');
  const sampleTranscription = "I want to implement a new user authentication system with multi-factor authentication, including email verification and SMS backup codes.";
  
  // Progress-driven state calculation
  const recordingState: RecordingState = (() => {
    if (!isInView) return 'idle';
    if (progress < 0.1) return 'idle';
    if (progress < 0.15) return 'starting';
    if (progress < 0.5) return 'recording';
    if (progress < 0.7) return 'processing';
    return 'transcribed';
  })();
  
  // Progress-driven duration and audio level calculation
  const duration = (() => {
    if (recordingState !== 'recording') return 0;
    const recordingStart = 0.15;
    const recordingEnd = 0.5;
    const localProgress = (progress - recordingStart) / (recordingEnd - recordingStart);
    return Math.floor(localProgress * 3); // 3 seconds max
  })();
  
  const audioLevel = (() => {
    if (recordingState !== 'recording') return 0;
    // Create deterministic audio level based on progress
    const time = progress * 50; // Scale for sine wave frequency
    const sineWave = Math.sin(time * 3) * 0.5 + 0.5;
    const pseudoRandom = ((progress * 7919) % 1) * 0.3; // Deterministic "random" component
    return sineWave * 0.7 + pseudoRandom * 0.3;
  })();
  
  // Progress-driven transcription typing
  const taskFieldText = (() => {
    if (recordingState !== 'transcribed') return '';
    const transcriptionStart = 0.7;
    const transcriptionEnd = 1.0;
    const localProgress = Math.max(0, (progress - transcriptionStart) / (transcriptionEnd - transcriptionStart));
    const targetLength = Math.floor(localProgress * sampleTranscription.length);
    return sampleTranscription.slice(0, targetLength);
  })();


  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusDot = () => {
    if (recordingState === 'recording') return 'bg-red-500 animate-pulse';
    if (recordingState === 'starting') return 'bg-amber-500 animate-bounce';
    if (recordingState === 'processing') return 'bg-primary animate-pulse';
    return 'bg-gray-300';
  };

  return (
    <div className="w-full space-y-3">
      <div className="inline-flex items-center gap-2 flex-wrap">
        {(recordingState !== 'idle') && (
          <div 
            className={`w-2 h-2 rounded-full ${getStatusDot()} transition-all duration-200`}
          />
        )}
        
        <DesktopButton
          variant="ghost"
          size="sm"
          className={`h-6 w-6 transition-all duration-200 ${
            recordingState === 'recording'
              ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
              : recordingState === 'starting'
                ? "bg-amber-500 hover:bg-amber-600 text-white animate-bounce"
                : "hover:bg-success/10 text-success"
          }`}
        >
          {recordingState === 'recording' ? (
            <MicOff className="h-4 w-4" />
          ) : recordingState === 'starting' ? (
            <Mic className="h-4 w-4 animate-spin" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </DesktopButton>

        {recordingState === 'starting' && (
          <div className="flex items-center gap-2 text-base">
            <div className="relative">
              <div className="w-4 h-4 bg-amber-500 rounded-full animate-pulse" />
              <div className="absolute inset-0 w-4 h-4 bg-amber-400 rounded-full animate-ping opacity-75" />
            </div>
            <span className="text-warning-foreground font-medium bg-warning/10 px-2 py-0.5 rounded-md border border-warning/20">
              Starting recording...
            </span>
          </div>
        )}

        {recordingState === 'recording' && (
          <div className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <span className="text-foreground font-mono min-w-[45px]">
              {formatDuration(duration)}
            </span>
            <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-red-500 transition-transform duration-100 ease-out origin-left"
                style={{ transform: `scaleX(${audioLevel})` }}
              />
            </div>
          </div>
        )}

        {recordingState === 'processing' && (
          <div className="flex items-center gap-2 text-base">
            <div className="w-4 h-4 border-2 border-info border-t-transparent rounded-full animate-spin" />
            <span className="text-info-foreground font-medium">Processing...</span>
          </div>
        )}

        {(recordingState === 'idle' || recordingState === 'transcribed') && (
          <div className="flex items-center gap-1.5">
            <DesktopSelect value={languageCode} onChange={setLanguageCode}>
              <div className="h-6 w-[100px] text-sm border-0 bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer flex items-center justify-between px-2 rounded">
                <span className="text-xs">English</span>
                <ChevronDown className="h-3 w-3" />
              </div>
              <DesktopSelectOption value="en-US">English (US)</DesktopSelectOption>
              <DesktopSelectOption value="en-GB">English (UK)</DesktopSelectOption>
              <DesktopSelectOption value="es-ES">Spanish</DesktopSelectOption>
              <DesktopSelectOption value="fr-FR">French</DesktopSelectOption>
            </DesktopSelect>

            <DesktopSelect value="default">
              <div className="h-6 px-2 text-sm border-0 bg-muted/50 hover:bg-muted focus:ring-1 focus:ring-ring transition-colors cursor-pointer flex items-center justify-between rounded">
                <span className="text-xs">Default</span>
                <ChevronDown className="h-3 w-3 ml-1" />
              </div>
              <DesktopSelectOption value="default">Default</DesktopSelectOption>
              <DesktopSelectOption value="external">External USB Microphone</DesktopSelectOption>
              <DesktopSelectOption value="headset">Bluetooth Headset</DesktopSelectOption>
            </DesktopSelect>
          </div>
        )}
      </div>


      {/* Task Description Field - Always visible */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-foreground mb-2">
          Task Description
        </label>
        <DesktopTextarea
          value={taskFieldText}
          placeholder="Describe what you want to implement..."
          rows={4}
          className="w-full border rounded-xl bg-background backdrop-blur-sm text-foreground p-4 resize-y font-normal shadow-soft min-h-[100px]"
          readOnly
        />
      </div>
    </div>
  );
}
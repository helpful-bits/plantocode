"use client";

import { useEffect, useState } from 'react';
import { useScreenRecording } from '@/contexts/screen-recording';
import { Button } from '@/ui/button';
import { Square } from 'lucide-react';
import { isMobilePlatform } from '@/utils/platform';

export function GlobalRecordingIndicator() {
  const { isRecording, startTime, stopRecording } = useScreenRecording();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if on mobile platform
    isMobilePlatform().then(setIsMobile);
  }, []);

  useEffect(() => {
    if (!isRecording || !startTime) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);

    return () => clearInterval(interval);
  }, [isRecording, startTime]);

  // Don't show recording indicator on mobile platforms
  if (!isRecording || isMobile) {
    return null;
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const h = hours.toString().padStart(2, '0');
    const m = (minutes % 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-background border rounded-lg p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <div className="relative">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-ping opacity-75" />
        </div>
        <span className="text-sm font-medium">Recording</span>
      </div>
      
      <span className="text-sm font-mono text-muted-foreground">
        {formatTime(elapsedTime)}
      </span>
      
      <Button
        variant="destructive"
        size="sm"
        onClick={stopRecording}
        className="flex items-center gap-1"
      >
        <Square className="w-3 h-3" />
        Stop
      </Button>
    </div>
  );
}
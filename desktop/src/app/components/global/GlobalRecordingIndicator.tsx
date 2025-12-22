"use client";

import { useEffect, useState } from 'react';
import { useScreenRecording } from '@/contexts/screen-recording';
import { Button } from '@/ui/button';
import { Square } from 'lucide-react';
import { isMobilePlatform } from '@/utils/platform';
import { listen } from '@tauri-apps/api/event';

export function GlobalRecordingIndicator() {
  const { isRecording, startTime, stopRecording } = useScreenRecording();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [sizeBytes, setSizeBytes] = useState<number | null>(null);
  const [diskWarning, setDiskWarning] = useState<{level: "warn" | "critical"; availableBytes: number} | null>(null);
  const [error, setError] = useState<{name: string; message: string} | null>(null);
  const [sourceEndedReason, setSourceEndedReason] = useState<string | null>(null);

  useEffect(() => {
    // Check if on mobile platform
    isMobilePlatform().then(setIsMobile);
  }, []);

  useEffect(() => {
    if (!isRecording || !startTime) {
      setElapsedTime(0);
      setSizeBytes(null);
      setDiskWarning(null);
      setError(null);
      setSourceEndedReason(null);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 100);

    return () => clearInterval(interval);
  }, [isRecording, startTime]);

  // Listen for recording events
  useEffect(() => {
    if (!isRecording) return;

    let unlistenBytes: (() => void) | undefined;
    let unlistenDiskWarning: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    let unlistenSourceEnded: (() => void) | undefined;

    const setupListeners = async () => {
      // Listen for size updates
      unlistenBytes = await listen<{ bytes: number }>('recording-bytes-updated', (event) => {
        setSizeBytes(event.payload.bytes);
      });

      // Listen for disk warnings
      unlistenDiskWarning = await listen<{ level: "warn" | "critical"; availableBytes: number }>('recording-disk-warning', (event) => {
        setDiskWarning(event.payload);
      });

      // Listen for recording errors
      unlistenError = await listen<{ name: string; message: string }>('recording-error', (event) => {
        setError(event.payload);
      });

      // Listen for source ended
      unlistenSourceEnded = await listen<{ reason?: string }>('recording-source-ended', (event) => {
        setSourceEndedReason(event.payload.reason || 'Screen sharing stopped');
      });
    };

    setupListeners();

    return () => {
      unlistenBytes?.();
      unlistenDiskWarning?.();
      unlistenError?.();
      unlistenSourceEnded?.();
    };
  }, [isRecording]);

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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 bg-background border rounded-lg p-3 shadow-lg max-w-md">
      <div className="flex items-center gap-3">
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

        {sizeBytes != null && (
          <span className="text-sm text-muted-foreground">
            Size: {formatFileSize(sizeBytes)}
          </span>
        )}

        <Button
          variant="destructive"
          size="sm"
          onClick={stopRecording}
          className="flex items-center gap-1 ml-auto"
        >
          <Square className="w-3 h-3" />
          Stop
        </Button>
      </div>

      {diskWarning && (
        <div className={`text-xs ${diskWarning.level === "critical" ? "text-red-500" : "text-yellow-500"}`}>
          Low disk space ({formatFileSize(diskWarning.availableBytes)} free)
        </div>
      )}

      {error && (
        <div className="text-xs text-red-500">
          Recording error: {error.message}
        </div>
      )}

      {sourceEndedReason && !error && (
        <div className="text-xs text-yellow-500">
          {sourceEndedReason}
        </div>
      )}
    </div>
  );
}

import React, { useRef, useCallback, useEffect } from "react";
import type { Terminal } from "@xterm/xterm";
import { TerminalView } from "./TerminalView";
import { useTerminalSessions } from "@/contexts/terminal-sessions/useTerminalSessions";

interface BufferedTerminalViewProps {
  jobId: string;
  onReady?: (term: Terminal) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  height?: number | string;
  workingDir?: string;
}

export const BufferedTerminalView = React.memo<BufferedTerminalViewProps>(({
  jobId,
  onReady,
  onFocus,
  onBlur,
  height = "100%",
  workingDir,
}) => {
  const terminalRef = useRef<Terminal | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const hasReceivedOutputRef = useRef(false);
  const { write, resize, startSession, setOutputBytesCallback, removeOutputBytesCallback, handleImagePaste: handleImagePasteFromContext, detachSession } = useTerminalSessions();

  // When terminal is ready, set up EVERYTHING in one place
  const handleReady = useCallback((term: Terminal) => {
    // Clean up any previous setup for old jobId
    if (currentJobIdRef.current && currentJobIdRef.current !== jobId) {
      removeOutputBytesCallback(currentJobIdRef.current);
      detachSession(currentJobIdRef.current);
    }

    terminalRef.current = term;
    currentJobIdRef.current = jobId;
    hasReceivedOutputRef.current = false;


    const outputHandler = (chunk: Uint8Array, onComplete: () => void) => {
      try {
        term.write(chunk, onComplete);
      } catch {
        onComplete(); // Prevent deadlock on error
      }
    };
    setOutputBytesCallback(jobId, outputHandler);


    // Start the PTY session
    startSession(jobId, workingDir ? { workingDir } : undefined).catch(() => {/* errors handled by notification system */});

    // Notify parent
    onReady?.(term);
  }, [jobId, startSession, setOutputBytesCallback, removeOutputBytesCallback, onReady]);

  // Forward keystrokes to PTY
  const handleData = useCallback((data: string) => {
    write(jobId, data);
  }, [jobId, write]);

  // Forward resize to PTY
  const handleResize = useCallback((cols: number, rows: number) => {
    resize(jobId, cols, rows);
    // DO NOT call onResize prop to prevent double-resize storms
  }, [jobId, resize]);

  const handleImagePaste = useCallback((file: File) => {
    handleImagePasteFromContext(jobId, file).catch(() => {
      // Errors are surfaced via notifications in the provider.
    });
  }, [handleImagePasteFromContext, jobId]);

  // Cleanup when jobId changes or component unmounts
  React.useEffect(() => {
    return () => {
      if (currentJobIdRef.current) {
        removeOutputBytesCallback(currentJobIdRef.current);
        detachSession(currentJobIdRef.current);
        currentJobIdRef.current = null;
      }
    };
  }, [jobId, removeOutputBytesCallback, detachSession]);

  // Reset state when jobId changes
  useEffect(() => {
    hasReceivedOutputRef.current = false;
  }, [jobId]);

  return (
    <TerminalView
      onReady={handleReady}
      onData={handleData}
      onResize={handleResize}
      onFocus={onFocus}
      onBlur={onBlur}
      onImagePaste={handleImagePaste}
      height={height}
      jobId={jobId}
    />
  );
});

BufferedTerminalView.displayName = "BufferedTerminalView";

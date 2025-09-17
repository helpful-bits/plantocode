import React, { useRef, useCallback } from "react";
import type { Terminal } from "@xterm/xterm";
import { TerminalView } from "./TerminalView";
import { useTerminalSessions } from "@/contexts/terminal-sessions/useTerminalSessions";

interface BufferedTerminalViewProps {
  jobId: string;
  onReady?: (term: Terminal) => void;
  onResize?: (cols: number, rows: number) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  height?: number | string;
}

export const BufferedTerminalView = React.memo<BufferedTerminalViewProps>(({
  jobId,
  onReady,
  onResize,
  onFocus,
  onBlur,
  height = "100%",
}) => {
  const terminalRef = useRef<Terminal | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { write, resize, startSession, setOutputBytesCallback, removeOutputBytesCallback } = useTerminalSessions();

  // When terminal is ready, set up EVERYTHING in one place
  const handleReady = useCallback((term: Terminal) => {
    // Clean up any previous setup
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    terminalRef.current = term;

    // Start the PTY session
    startSession(jobId).catch(() => {/* errors handled by notification system */});

    // Set up output handler - PTY writes to terminal
    const outputHandler = (bytes: Uint8Array, onComplete: () => void) => {
      try {
        term.write(bytes, onComplete);
      } catch {
        onComplete(); // Prevent deadlock on error
      }
    };
    setOutputBytesCallback(jobId, outputHandler);

    // Store cleanup function
    cleanupRef.current = () => {
      removeOutputBytesCallback(jobId);
    };

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
    onResize?.(cols, rows);
  }, [jobId, resize, onResize]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  return (
    <TerminalView
      onReady={handleReady}
      onData={handleData}
      onResize={handleResize}
      onFocus={onFocus}
      onBlur={onBlur}
      height={height}
    />
  );
});

BufferedTerminalView.displayName = "BufferedTerminalView";
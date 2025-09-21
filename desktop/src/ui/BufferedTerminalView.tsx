import React, { useRef, useCallback, useEffect } from "react";
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
  workingDir?: string;
}

export const BufferedTerminalView = React.memo<BufferedTerminalViewProps>(({
  jobId,
  onReady,
  onResize,
  onFocus,
  onBlur,
  height = "100%",
  workingDir,
}) => {
  const terminalRef = useRef<Terminal | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const hasReceivedOutputRef = useRef(false);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { write, resize, startSession, setOutputBytesCallback, removeOutputBytesCallback, handleImagePaste: handleImagePasteFromContext } = useTerminalSessions();

  // When terminal is ready, set up EVERYTHING in one place
  const handleReady = useCallback((term: Terminal) => {
    // Clean up any previous setup for old jobId
    if (currentJobIdRef.current && currentJobIdRef.current !== jobId) {
      removeOutputBytesCallback(currentJobIdRef.current);
    }

    terminalRef.current = term;
    currentJobIdRef.current = jobId;
    hasReceivedOutputRef.current = false;

    // Show immediate connection status
    term.write("\x1b[90mConnecting to session...\x1b[0m\r\n");

    const outputHandler = (bytes: Uint8Array, onComplete: () => void) => {
      try {
        // Track that we've received real output
        if (bytes.length > 0 && !hasReceivedOutputRef.current) {
          hasReceivedOutputRef.current = true;
          // Clear status timeout since we got real output
          if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current);
            statusTimeoutRef.current = null;
          }
        }
        term.write(bytes, onComplete);
      } catch {
        onComplete(); // Prevent deadlock on error
      }
    };
    setOutputBytesCallback(jobId, outputHandler);

    // Set timeout to show helpful message if no output after 2 seconds
    statusTimeoutRef.current = setTimeout(() => {
      if (!hasReceivedOutputRef.current && terminalRef.current) {
        terminalRef.current.write("\r\n\x1b[93mNo output received yet\x1b[0m\r\n");
        terminalRef.current.write("\x1b[90mTry: Press Enter for prompt\x1b[0m\r\n");
        terminalRef.current.write("\x1b[90mTry: Press Ctrl+C to interrupt\x1b[0m\r\n");
      }
      statusTimeoutRef.current = null;
    }, 2000);

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
    onResize?.(cols, rows);
  }, [jobId, resize, onResize]);

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
        currentJobIdRef.current = null;
      }
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
    };
  }, [jobId, removeOutputBytesCallback]);

  // Reset state when jobId changes
  useEffect(() => {
    hasReceivedOutputRef.current = false;
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }
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
    />
  );
});

BufferedTerminalView.displayName = "BufferedTerminalView";

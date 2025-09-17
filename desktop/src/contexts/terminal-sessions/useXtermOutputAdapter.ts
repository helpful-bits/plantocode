import { useEffect } from 'react';
import type { Terminal } from '@xterm/xterm';
import { useTerminalSessions } from './index';

export function useXtermOutputAdapter(jobId: string | null | undefined, term: Terminal | null | undefined) {
  const { setOutputBytesCallback, removeOutputBytesCallback } = useTerminalSessions();

  useEffect(() => {
    if (!jobId || !term) return;
    const handler = (bytes: Uint8Array, onComplete: () => void) => {
      try {
        // xterm v5 write supports Uint8Array with callback
        term.write(bytes, onComplete);
      } catch {
        // Ensure stream doesn't deadlock if write throws
        onComplete();
      }
    };
    setOutputBytesCallback(jobId, handler);
    return () => {
      removeOutputBytesCallback(jobId);
    };
  }, [jobId, term, setOutputBytesCallback, removeOutputBytesCallback]);
}
"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { Channel } from "@tauri-apps/api/core";
import { invoke } from "@/utils/tauri-invoke-wrapper";
import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { useNotification } from "@/contexts/notification-context";

import type {
  TerminalSession,
  TerminalStatus,
  StartSessionOptions,
  TerminalSessionsContextShape,
} from "./types";

const STUCK_TIMEOUT_MS = 2 * 60 * 1000;

function normalizeToUint8Array(chunk: any): Uint8Array {
  // Fast path for most common case
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);

  // Handle Tauri's array format efficiently
  if (Array.isArray(chunk)) {
    // Avoid creating intermediate array with from()
    const result = new Uint8Array(chunk.length);
    for (let i = 0; i < chunk.length; i++) {
      result[i] = chunk[i];
    }
    return result;
  }

  if (chunk?.data) {
    if (chunk.data instanceof ArrayBuffer) {
      return new Uint8Array(chunk.data);
    }
    if (Array.isArray(chunk.data)) {
      const result = new Uint8Array(chunk.data.length);
      for (let i = 0; i < chunk.data.length; i++) {
        result[i] = chunk.data[i];
      }
      return result;
    }
  }

  return new Uint8Array();
}

export const TerminalSessionsContext = createContext<TerminalSessionsContextShape>({
  sessions: new Map(),
  canOpenTerminal: async () => ({ ok: false }),
  startSession: async () => {},
  write: () => {},
  sendCtrlC: async () => {},
  kill: async () => {},
  clearLog: async () => {},
  deleteLog: async () => {},
  getStatus: () => "idle",
  getActiveCount: () => 0,
  getSession: () => undefined,
  setOutputCallback: () => {},
  removeOutputCallback: () => {},
  setOutputBytesCallback: () => {},
  removeOutputBytesCallback: () => {},
  resize: async () => {},
});

export function TerminalSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, TerminalSession>>(new Map());
  const sessionsRef = useRef<Map<string, TerminalSession>>(new Map());
  const stuckTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const outputBytesCallbacksRef = useRef<Map<string, (data: Uint8Array, onComplete: () => void) => void>>(new Map());
  const channelsRef = useRef<Map<string, Channel<any>>>(new Map());
  const readyFlagsRef = useRef<Map<string, boolean>>(new Map());
  const rafIdsRef = useRef<Map<string, number>>(new Map());
  const bytesBatchesRef = useRef<Map<string, Uint8Array[]>>(new Map());

  // Flow control state tracking
  const pendingWritesRef = useRef<Map<string, number>>(new Map());
  const isPausedRef = useRef<Map<string, boolean>>(new Map());
  const MAX_PENDING_WRITES = 8; // pause at/above
  const RESUME_THRESHOLD = 4;   // resume at/below

  // Input write coalescing
  const inputQueuesRef = useRef<Map<string, string[]>>(new Map());
  const inputTimersRef = useRef<Map<string, number>>(new Map());

  // Text encoder for ultra-low latency input processing
  const encoder = new TextEncoder();

  const { showNotification } = useNotification();

  // Keep ref in sync with state
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const updateSessionStatus = useCallback((jobId: string, status: TerminalStatus, exitCode?: number) => {
    setSessions(prev => {
      const newMap = new Map(prev);
      const session = newMap.get(jobId);
      if (session) {
        newMap.set(jobId, { ...session, status, exitCode });
      }
      return newMap;
    });
  }, []);

  const updateLastOutputAt = useCallback((jobId: string) => {
    setSessions(prev => {
      const newMap = new Map(prev);
      const session = newMap.get(jobId);
      if (session) {
        newMap.set(jobId, { ...session, lastOutputAt: new Date() });
      }
      return newMap;
    });
  }, []);


  const scheduleStuckCheck = useCallback((jobId: string) => {
    const existingTimeout = stuckTimeoutsRef.current.get(jobId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      const session = sessionsRef.current.get(jobId);
      if (session && session.status === "running") {
        updateSessionStatus(jobId, "stuck");
      }
      stuckTimeoutsRef.current.delete(jobId);
    }, STUCK_TIMEOUT_MS);

    stuckTimeoutsRef.current.set(jobId, timeoutId);
  }, [updateSessionStatus]);

  const setOutputCallback = useCallback((jobId: string, callback: (data: string) => void) => {
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const bytesCallback = (bytes: Uint8Array, onComplete: () => void) => {
      callback(decoder.decode(bytes, { stream: true }));
      onComplete(); // Important: immediately ack for string callbacks
    };
    outputBytesCallbacksRef.current.set(jobId, bytesCallback);
  }, []);

  const removeOutputCallback = useCallback((jobId: string) => {
    outputBytesCallbacksRef.current.delete(jobId);
  }, []);

  const setOutputBytesCallback = useCallback((jobId: string, cb: (data: Uint8Array, onComplete: () => void) => void) => {
    outputBytesCallbacksRef.current.set(jobId, cb);
  }, []);

  const removeOutputBytesCallback = useCallback((jobId: string) => {
    outputBytesCallbacksRef.current.delete(jobId);
  }, []);

  const resize = useCallback(async (jobId: string, cols: number, rows: number) => {
    try {
      await invoke("resize_terminal_session_command", {
        jobId,
        cols,
        rows
      });
    } catch (error) {
      console.error(`Resize failed for ${jobId}:`, error);
      throw error;
    }
  }, []);


  const canOpenTerminal = useCallback(async (_jobId?: string, onOutput?: (data: string) => void) => {
    try {
      const result = await invoke<{
        serverSelected: boolean;
        userAuthenticated: boolean;
        apiClientsReady: boolean;
        message?: string;
      }>("get_terminal_prerequisites_status_command");

      if (!result.userAuthenticated) {
        showNotification({
          type: "error",
          title: "Authentication Required",
          message: "Please log in to use the terminal",
        });
        if (onOutput) {
          onOutput("\x1b[31mError: Please log in to use the terminal\x1b[0m\r\n");
        }
        return { ok: false, reason: "auth" as const, message: "Please log in to use the terminal" };
      }

      if (!result.serverSelected) {
        showNotification({
          type: "error",
          title: "Server Not Selected",
          message: "Please select a server region to use the terminal",
        });
        if (onOutput) {
          onOutput("\x1b[31mError: Please select a server region to use the terminal\x1b[0m\r\n");
        }
        return { ok: false, reason: "region" as const, message: "Please select a server region to use the terminal" };
      }

      if (!result.apiClientsReady) {
        showNotification({
          type: "error",
          title: "API Not Ready",
          message: "API clients are not ready. Please try again in a moment",
        });
        if (onOutput) {
          onOutput("\x1b[31mError: API clients are not ready. Please try again in a moment\x1b[0m\r\n");
        }
        return { ok: false, reason: "api" as const, message: "API clients are not ready" };
      }

      return { ok: true };
    } catch (error) {
      showNotification({
        type: "error",
        title: "Terminal Error",
        message: "Unable to verify terminal prerequisites",
      });
      if (onOutput) {
        onOutput("\x1b[31mError: Unable to verify terminal prerequisites\x1b[0m\r\n");
      }
      return { ok: false, reason: "api" as const, message: "Unable to verify terminal prerequisites" };
    }
  }, [showNotification]);

  useEffect(() => {
    let unlistenExit: (() => void) | null = null;
    let unlistenReady: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenExit = await listen("terminal-exit", (event: any) => {
        const { jobId, code } = event.payload;

        updateSessionStatus(jobId, code === 0 ? "completed" : "failed", code);

        const stuckTimeout = stuckTimeoutsRef.current.get(jobId);
        if (stuckTimeout) {
          clearTimeout(stuckTimeout);
          stuckTimeoutsRef.current.delete(jobId);
        }


        // Session ended, status updated above

        channelsRef.current.delete(jobId);
        readyFlagsRef.current.delete(jobId);
        pendingWritesRef.current.delete(jobId);
        isPausedRef.current.delete(jobId);

        // Clean up refs
        outputBytesCallbacksRef.current.delete(jobId);
        bytesBatchesRef.current.delete(jobId);

        // Clean up input coalescing
        const inputTimer = inputTimersRef.current.get(jobId);
        if (inputTimer) {
          clearTimeout(inputTimer);
          inputTimersRef.current.delete(jobId);
        }
        inputQueuesRef.current.delete(jobId);

        // Clean up the global reference to prevent memory leak
        delete (window as any)[`__terminal_channel_${jobId}`];

        // Clean up RAF and batch
        const rafId = rafIdsRef.current.get(jobId);
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafIdsRef.current.delete(jobId);
        }
      });

      unlistenReady = await listen('terminal-ready', (event: any) => {
        // The payload might be the jobId directly or an object containing it
        const rJob = typeof event.payload === 'string' ? event.payload : event.payload?.jobId;
        if (!rJob) {
          console.warn('terminal-ready event missing jobId:', event.payload);
          return;
        }
        readyFlagsRef.current.set(rJob, true);


        setSessions(prev => {
          const next = new Map(prev);
          const s = next.get(rJob);
          if (s) {
            next.set(rJob, { ...s, status: "running", ready: true });
          }
          return next;
        });
      });
    };

    setupListeners();

    return () => {
      if (unlistenExit) unlistenExit();
      if (unlistenReady) unlistenReady();
    };
  }, [updateSessionStatus, scheduleStuckCheck]);

  const startSession = useCallback(async (jobId: string, opts?: StartSessionOptions & { onOutput?: (data: string) => void }) => {
    const canOpen = await canOpenTerminal(jobId, opts?.onOutput);
    if (!canOpen.ok) {
      return;
    }

    try {
      // Register output callback if provided
      if (opts?.onOutput) {
        setOutputCallback(jobId, opts.onOutput);
      }

      // ALWAYS create a new Channel first
      let outputChannel: Channel<any>;
      try {
        outputChannel = new Channel<any>();
      } catch (error) {
        console.error('Error creating Channel:', error);
        // Channel creation failed, error logged above
        return;
      }

      outputChannel.onmessage = (payload: unknown) => {
        try {
          const bytes = normalizeToUint8Array(payload);
          if (bytes.length === 0) return;
          const bytesCallback = outputBytesCallbacksRef.current.get(jobId);
          if (!bytesCallback) return;

          const pending = (pendingWritesRef.current.get(jobId) || 0) + 1;
          pendingWritesRef.current.set(jobId, pending);

          if (pending >= MAX_PENDING_WRITES && !isPausedRef.current.get(jobId)) {
            isPausedRef.current.set(jobId, true);
            invoke("pause_terminal_output_command", { jobId }).catch(() => {});
          }

          bytesCallback(bytes, () => {
            const current = (pendingWritesRef.current.get(jobId) || 1) - 1;
            pendingWritesRef.current.set(jobId, current);

            if (current <= RESUME_THRESHOLD && isPausedRef.current.get(jobId)) {
              isPausedRef.current.set(jobId, false);
              invoke("resume_terminal_output_command", { jobId }).catch(() => {});
            }
          });

          updateLastOutputAt(jobId);
          scheduleStuckCheck(jobId);

          const s = sessionsRef.current.get(jobId);
          if (s && s.status === "starting") {
            setSessions(prev => {
              const next = new Map(prev);
              const cur = next.get(jobId);
              if (cur && cur.status === "starting") {
                next.set(jobId, { ...cur, status: "running", ready: true });
              }
              return next;
            });
            readyFlagsRef.current.set(jobId, true);
          }
        } catch (e) {
          console.warn('terminal message handler error', jobId, e);
        }
      };

      // Store the channel reference BEFORE invoking to prevent GC
      channelsRef.current.set(jobId, outputChannel);
      (window as any)[`__terminal_channel_${jobId}`] = outputChannel;

      // Check if session exists and is running
      const existingSession = sessions.get(jobId);
      if (existingSession?.status === "running") {
        // Attach to existing session
        try {
          await invoke("attach_terminal_output_command", {
            jobId,
            output: outputChannel
          });

          // Set ready immediately for existing sessions
          readyFlagsRef.current.set(jobId, true);

          // Successfully attached to existing session

          return;
        } catch (attachError) {
          console.error('Failed to attach to terminal session:', attachError);
          // Fall through to start a new session
        }
      }

      // Start new session
      const newSession: TerminalSession = {
        jobId,
        status: "starting",
        lastOutputAt: new Date(),
      };

      setSessions(prev => new Map(prev).set(jobId, newSession));
      readyFlagsRef.current.set(jobId, false);
      scheduleStuckCheck(jobId);

      try {
        await invoke("start_terminal_session_command", {
          jobId: jobId,
          options: {
            workingDirectory: opts?.workingDir || ".",
            environment: opts?.env || {},
            rows: opts?.rows || 24,
            cols: opts?.cols || 80,
          },
          output: outputChannel
        });

        // For new sessions, replay any existing log
        if (opts?.onOutput) {
          try {
            const logContent = await tauriInvoke<string>("read_terminal_log_command", { jobId });
            if (logContent && logContent.trim()) {
              // Use bytes path for consistency
              const encoder = new TextEncoder();
              const bytes = encoder.encode(logContent);
              outputBytesCallbacksRef.current.get(jobId)?.(bytes, () => {});
            }
          } catch (_) {
            // Ignore replay errors for new sessions
          }
        }

        // Session started successfully, terminal-ready event will handle notification

      } catch (invokeError) {
        console.error('Failed to start terminal session:', invokeError);

        // Clean up on failure
        channelsRef.current.delete(jobId);
        readyFlagsRef.current.delete(jobId);
        delete (window as any)[`__terminal_channel_${jobId}`];

        throw invokeError;
      }
    } catch (error) {
      updateSessionStatus(jobId, "failed");

      const callback = outputBytesCallbacksRef.current.get(jobId);
      if (callback) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        callback(new TextEncoder().encode(`\x1b[31mFailed to start terminal session: ${errorMsg}\x1b[0m\r\n`), () => {});
      }

      showNotification({
        title: "Terminal Session Failed",
        message: `Failed to start terminal session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    }
  }, [sessions, setOutputCallback, scheduleStuckCheck, updateSessionStatus, canOpenTerminal, showNotification]);

  const write = useCallback((jobId: string, data: string) => {
    const bytes = encoder.encode(data);

    // DEV-only byte diagnostics for critical keys
    if (import.meta.env.DEV && data && data.length <= 4) {
      const b = bytes[0];
      if (b !== undefined) {
        // 0x7f = DEL (Backspace), 0x1b = ESC, 0x03 = ETX (Ctrl+C), 0x0d = CR, 0x0a = LF
        console.debug(`[terminal-dev] write ${jobId}: byte=0x${b.toString(16)} (${b})`);
      }
    }

    // For small inputs (≤8 bytes): send IMMEDIATELY with no delay using tauriInvoke directly
    if (bytes.length <= 8) {
      tauriInvoke('write_terminal_input_command', { jobId, data: Array.from(bytes) }).catch(() => {});
      return;
    }

    // For larger inputs (>8 bytes): micro-batch with only 6ms delay
    const q = inputQueuesRef.current.get(jobId) ?? [];
    q.push(data);
    inputQueuesRef.current.set(jobId, q);

    if (!inputTimersRef.current.get(jobId)) {
      const t = window.setTimeout(() => {
        inputTimersRef.current.delete(jobId);
        const queue = inputQueuesRef.current.get(jobId) ?? [];
        inputQueuesRef.current.delete(jobId);
        const payload = queue.join('');
        const batchBytes = encoder.encode(payload);
        // Non-blocking invoke with error suppression
        tauriInvoke('write_terminal_input_command', { jobId, data: Array.from(batchBytes) }).catch(() => {});
      }, 6); // Micro-batch with only 6ms delay for larger inputs
      inputTimersRef.current.set(jobId, t as unknown as number);
    }
  }, []);

  const sendCtrlC = useCallback(async (jobId: string) => {
    const session = sessionsRef.current.get(jobId);
    if (!session || session.status !== "running") {
      return;
    }
    await invoke("send_ctrl_c_to_terminal_command", { jobId: jobId });
  }, []);

  const kill = useCallback(async (jobId: string) => {
    const session = sessions.get(jobId);
    if (!session || session.status !== "running") {
      return;
    }

    try {
      await invoke("kill_terminal_session_command", { jobId: jobId });
      // Status update will come from terminal-exit event
    } catch (error) {
      // Silent error handling
    }
  }, [sessions]);

  const clearLog = useCallback(async (jobId: string) => {
    try {
      await invoke("clear_terminal_log_command", { jobId: jobId });
    } catch (error) {
      throw error;
    }
  }, []);

  const deleteLog = useCallback(async (jobId: string) => {
    try {
      await invoke("delete_terminal_log_command", { jobId: jobId });
    } catch (error) {
      throw error;
    }
  }, []);

  const getStatus = useCallback((jobId: string): TerminalStatus => {
    const session = sessions.get(jobId);
    return session?.status ?? "idle";
  }, [sessions]);

  const getActiveCount = useCallback((): number => {
    let count = 0;
    for (const session of sessions.values()) {
      if (session.status === "running") {
        count++;
      }
    }
    return count;
  }, [sessions]);

  const getSession = useCallback((jobId: string): TerminalSession | undefined => {
    return sessions.get(jobId);
  }, [sessions]);

  useEffect(() => {
    return () => {
      // Clear timeouts and RAF
      for (const timeoutId of stuckTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      for (const rafId of rafIdsRef.current.values()) {
        cancelAnimationFrame(rafId);
      }
      for (const timerId of inputTimersRef.current.values()) {
        clearTimeout(timerId);
      }

      // Clear all refs
      stuckTimeoutsRef.current.clear();
      channelsRef.current.clear();
      readyFlagsRef.current.clear();
      rafIdsRef.current.clear();
      outputBytesCallbacksRef.current.clear();
      bytesBatchesRef.current.clear();
      inputQueuesRef.current.clear();
      inputTimersRef.current.clear();
      pendingWritesRef.current.clear();
      isPausedRef.current.clear();
    };
  }, []);

  const contextValue = useMemo(() => ({
    sessions,
    canOpenTerminal: () => canOpenTerminal(),
    startSession,
    write,
    sendCtrlC,
    kill,
    clearLog,
    deleteLog,
    getStatus,
    getActiveCount,
    getSession,
    setOutputCallback,
    removeOutputCallback,
    setOutputBytesCallback,
    removeOutputBytesCallback,
    resize,
  }), [
    sessions,
    canOpenTerminal,
    startSession,
    write,
    sendCtrlC,
    kill,
    clearLog,
    deleteLog,
    getStatus,
    getActiveCount,
    getSession,
    setOutputCallback,
    removeOutputCallback,
    setOutputBytesCallback,
    removeOutputBytesCallback,
    resize,
  ]);

  return (
    <TerminalSessionsContext.Provider value={contextValue}>
      {children}
    </TerminalSessionsContext.Provider>
  );
}
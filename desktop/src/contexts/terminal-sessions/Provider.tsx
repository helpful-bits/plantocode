"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useNotification } from "@/contexts/notification-context";

import type {
  TerminalSession,
  TerminalStatus,
  StartSessionOptions,
  TerminalSessionsContextShape,
} from "./types";

const STUCK_TIMEOUT_MS = 2 * 60 * 1000;

export const TerminalSessionsContext = createContext<TerminalSessionsContextShape>({
  sessions: new Map(),
  canOpenTerminal: async () => ({ ok: false }),
  startSession: async () => {},
  write: async () => {},
  sendCtrlC: async () => {},
  kill: async () => {},
  clearLog: async () => {},
  deleteLog: async () => {},
  getStatus: () => "idle",
  getActiveCount: () => 0,
  getSession: () => undefined,
  setOutputCallback: () => {},
  removeOutputCallback: () => {},
});

export function TerminalSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, TerminalSession>>(new Map());
  const sessionsRef = useRef<Map<string, TerminalSession>>(new Map());
  const stuckTimeoutsRef = useRef<Map<string, number>>(new Map());
  const outputCallbacksRef = useRef<Map<string, (data: string) => void>>(new Map());
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
    outputCallbacksRef.current.set(jobId, callback);
  }, []);

  const removeOutputCallback = useCallback((jobId: string) => {
    outputCallbacksRef.current.delete(jobId);
  }, []);

  const canOpenTerminal = useCallback(async () => {
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
        return { ok: false, reason: "auth" as const, message: "Please log in to use the terminal" };
      }

      if (!result.serverSelected) {
        showNotification({
          type: "error",
          title: "Server Not Selected",
          message: "Please select a server region to use the terminal",
        });
        return { ok: false, reason: "region" as const, message: "Please select a server region to use the terminal" };
      }

      if (!result.apiClientsReady) {
        showNotification({
          type: "error",
          title: "API Not Ready",
          message: "API clients are not ready. Please try again in a moment",
        });
        return { ok: false, reason: "api" as const, message: "API clients are not ready" };
      }

      return { ok: true };
    } catch (error) {
      showNotification({
        type: "error",
        title: "Terminal Error",
        message: "Unable to verify terminal prerequisites",
      });
      return { ok: false, reason: "api" as const, message: "Unable to verify terminal prerequisites" };
    }
  }, [showNotification]);

  useEffect(() => {
    let unlistenExit: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenExit = await listen("terminal-exit", (event: any) => {
        const { jobId, code } = event.payload;
        
        updateSessionStatus(jobId, code === 0 ? "completed" : "failed", code);
        
        // Clear stuck timer
        const stuckTimeout = stuckTimeoutsRef.current.get(jobId);
        if (stuckTimeout) {
          clearTimeout(stuckTimeout);
          stuckTimeoutsRef.current.delete(jobId);
        }
        
        // Notify callback
        const callback = outputCallbacksRef.current.get(jobId);
        if (callback) {
          const statusMsg = code === 0 
            ? "\r\n\x1b[32mClaude session ended normally\x1b[0m\r\n" 
            : "\r\n\x1b[31mClaude session ended with error\x1b[0m\r\n";
          callback(statusMsg);
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenExit) unlistenExit();
    };
  }, [updateSessionStatus, scheduleStuckCheck]);

  const startSession = useCallback(async (jobId: string, opts?: StartSessionOptions & { onOutput?: (data: string) => void }) => {
    // Check prerequisites first
    const canOpen = await canOpenTerminal();
    if (!canOpen.ok) {
      return;
    }

    try {
      // Guard against duplicate start
      const existingSession = sessions.get(jobId);
      if (existingSession?.status === "running") {
        const callback = outputCallbacksRef.current.get(jobId);
        if (callback) {
          callback(`\x1b[33mSession already running for job ${jobId}\x1b[0m\r\n`);
        }
        return;
      }

      // Register output callback if provided
      if (opts?.onOutput) {
        setOutputCallback(jobId, opts.onOutput);
      }

      // Create initial session state
      const newSession: TerminalSession = {
        jobId,
        status: "running",
        lastOutputAt: new Date(),
      };

      setSessions(prev => new Map(prev).set(jobId, newSession));
      scheduleStuckCheck(jobId);

      // Create a Channel for output before invoking start command
      const outputChannel = new Channel<Uint8Array>((chunk) => {
        // Pass bytes to registered callback
        const callback = outputCallbacksRef.current.get(jobId);
        if (callback) {
          // If callback expects string, decode here
          const text = new TextDecoder('utf-8', { fatal: false }).decode(chunk);
          callback(text);
        }
        updateLastOutputAt(jobId);
        scheduleStuckCheck(jobId);
      });

      // Start session via Rust backend
      await invoke("start_terminal_session_command", {
        jobId: jobId,
        options: {
          workingDirectory: opts?.workingDir,
          environment: opts?.env,
          rows: opts?.rows,
          cols: opts?.cols,
        },
        output: outputChannel
      });

      // Send startup message to callback
      const callback = outputCallbacksRef.current.get(jobId);
      if (callback) {
        callback("\x1b[36m=== Starting Terminal Session ===\x1b[0m\r\n");
        callback("\x1b[33mLaunching Claude CLI...\x1b[0m\r\n\r\n");
      }
    } catch (error) {
      updateSessionStatus(jobId, "failed");

      const callback = outputCallbacksRef.current.get(jobId);
      if (callback) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        callback(`\x1b[31mFailed to start terminal session: ${errorMsg}\x1b[0m\r\n`);
      }

      showNotification({
        title: "Terminal Session Failed",
        message: `Failed to start terminal session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    }
  }, [sessions, setOutputCallback, scheduleStuckCheck, updateSessionStatus, canOpenTerminal, showNotification]);

  const write = useCallback(async (jobId: string, data: string) => {
    const session = sessions.get(jobId);
    if (!session || session.status !== "running") {
      throw new Error(`No active session found for job ${jobId}`);
    }
    
    const bytes = new TextEncoder().encode(data);
    await invoke("write_terminal_input_command", { 
      jobId: jobId, 
      data: Array.from(bytes) 
    });
  }, [sessions]);

  const sendCtrlC = useCallback(async (jobId: string) => {
    const session = sessions.get(jobId);
    if (!session || session.status !== "running") {
      throw new Error(`No active session found for job ${jobId}`);
    }

    await invoke("send_ctrl_c_to_terminal_command", { jobId: jobId });
  }, [sessions]);

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
      for (const timeoutId of stuckTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      stuckTimeoutsRef.current.clear();
    };
  }, []);

  const contextValue = useMemo(() => ({
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
  ]);

  return (
    <TerminalSessionsContext.Provider value={contextValue}>
      {children}
    </TerminalSessionsContext.Provider>
  );
}
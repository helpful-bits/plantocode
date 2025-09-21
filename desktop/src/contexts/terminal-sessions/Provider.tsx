"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { Channel } from "@tauri-apps/api/core";
import { invoke } from "@/utils/tauri-invoke-wrapper";
import { useNotification } from "@/contexts/notification-context";

import type {
  TerminalSession,
  TerminalStatus,
  StartSessionOptions,
  TerminalSessionsContextShape,
  AttentionState,
  AttentionLevel,
} from "./types";
import { useBackgroundJobs } from "../background-jobs";

const STUCK_TIMEOUT_MS = 2 * 60 * 1000;
const ATTENTION_THROTTLE_MS = 30 * 1000;
const INACTIVITY_TIMEOUT_MS = 30 * 1000;
const RETRY_DELAY_BASE = 100; // Base retry delay in ms
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [100, 500, 2000]; // Exponential backoff delays
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
  setOutputBytesCallback: () => {},
  removeOutputBytesCallback: () => {},
  resize: async () => {},
  handleImagePaste: async () => {},
  getAttention: () => undefined,
  getAttentionCount: () => 0,
  subscribeAttention: () => () => {},
  getSessionHealth: async () => ({ healthy: false }),
  recoverSession: async () => ({ success: false }),
  getConnectionState: () => 'disconnected',
});

export function TerminalSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, TerminalSession>>(new Map());
  const sessionsRef = useRef<Map<string, TerminalSession>>(new Map());
  const stuckTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const outputBytesCallbacksRef = useRef<Map<string, (data: Uint8Array, onComplete: () => void) => void>>(new Map());
  const channelsRef = useRef<Map<string, Channel<any>>>(new Map());
  const readyFlagsRef = useRef<Map<string, boolean>>(new Map());
  const attentionMap = useRef<Map<string, AttentionState>>(new Map());
  const attentionSubscribers = useRef<Set<(map: Map<string, AttentionState>) => void>>(new Set());
  const inactivityTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const attentionThrottles = useRef<Map<string, number>>(new Map());
  const processingQueue = useRef<Map<string, string>>(new Map());
  const processingTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const retryAttempts = useRef<Map<string, number>>(new Map());
  const connectionStates = useRef<Map<string, 'connected' | 'connecting' | 'disconnected' | 'error'>>(new Map());
  const retryTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const healthCheckIntervals = useRef<Map<string, NodeJS.Timer>>(new Map());
  const hasReceivedOutputRef = useRef<Map<string, boolean>>(new Map());

  // Text encoder for ultra-low latency input processing
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: false });

  const { showNotification, showPersistentNotification, dismissNotification } = useNotification();
  const { jobs } = useBackgroundJobs();
  const notificationIdsRef = useRef<Map<string, string>>(new Map());

  // Keep ref in sync with state
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const notifyAttentionSubscribers = useCallback(() => {
    attentionSubscribers.current.forEach(callback => {
      callback(attentionMap.current);
    });
  }, []);

  const setAttention = useCallback((jobId: string, level: AttentionLevel, message: string) => {
    const now = Date.now();
    const existing = attentionMap.current.get(jobId);

    if (existing && existing.level === level && existing.message === message) {
      return;
    }

    attentionMap.current.set(jobId, {
      level,
      message,
      lastDetectedAt: now,
    });

    // Show persistent notification for high attention
    if (level === 'high' && !notificationIdsRef.current.has(jobId)) {
      const notificationId = showPersistentNotification({
        title: "User input required",
        message: "Agent paused, waiting for your input.",
        tag: "terminal-input",
        data: { jobId },
        onClick: () => window.dispatchEvent(new CustomEvent('open-plan-terminal', { detail: { jobId } }))
      });
      notificationIdsRef.current.set(jobId, notificationId);
    }

    notifyAttentionSubscribers();
  }, [notifyAttentionSubscribers, showPersistentNotification]);

  const clearAttention = useCallback((jobId: string) => {
    if (attentionMap.current.has(jobId)) {
      attentionMap.current.delete(jobId);
      notifyAttentionSubscribers();
    }

    // Clear notification when attention is cleared
    const notificationId = notificationIdsRef.current.get(jobId);
    if (notificationId) {
      dismissNotification(notificationId);
      notificationIdsRef.current.delete(jobId);
    }
  }, [notifyAttentionSubscribers, dismissNotification]);

  // Pre-compile regex patterns once to avoid re-compilation on every call
  const attentionPatterns = useMemo(() => [
    /(awaiting|waiting).*(input|your response)/i,
    /press enter to continue/i,
    /select an option|\[y\/n\]/i,
  ], []);

  const detectAttentionFromOutput = useCallback((jobId: string, text: string) => {
    const now = Date.now();
    const lastThrottle = attentionThrottles.current.get(jobId) || 0;

    if (now - lastThrottle < ATTENTION_THROTTLE_MS) {
      return;
    }

    // Early exit if text is too short to match any patterns
    if (text.length < 5) return;

    // Use a single combined regex for better performance
    const combinedPattern = /(?:awaiting|waiting).*(?:input|your response)|press enter to continue|select an option|\[y\/n\]/i;

    if (combinedPattern.test(text)) {
      setAttention(jobId, 'high', 'User input required');
      attentionThrottles.current.set(jobId, now);
    }
  }, [setAttention]);

  const scheduleInactivityCheck = useCallback((jobId: string) => {
    const existingTimeout = inactivityTimeouts.current.get(jobId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = setTimeout(() => {
      const session = sessionsRef.current.get(jobId);
      if (session && session.status === 'running') {
        setAttention(jobId, 'medium', 'Terminal inactive - may require input');
      }
      inactivityTimeouts.current.delete(jobId);
    }, INACTIVITY_TIMEOUT_MS);

    inactivityTimeouts.current.set(jobId, timeoutId);
  }, [setAttention]);

  const clearInactivityCheck = useCallback((jobId: string) => {
    const existingTimeout = inactivityTimeouts.current.get(jobId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      inactivityTimeouts.current.delete(jobId);
    }
  }, []);

  // Helper function to show error messages directly in terminal
  const showTerminalError = useCallback((jobId: string, message: string, severity: 'warning' | 'error' = 'error') => {
    const callback = outputBytesCallbacksRef.current.get(jobId);
    if (callback) {
      const color = severity === 'error' ? '31' : '33'; // red for error, yellow for warning
      const errorMsg = `\x1b[${color}m${message}\x1b[0m\r\n`;
      callback(new TextEncoder().encode(errorMsg), () => {});
    }
  }, []);

  // Helper function to update connection state
  const updateConnectionState = useCallback((jobId: string, state: 'connected' | 'connecting' | 'disconnected' | 'error') => {
    connectionStates.current.set(jobId, state);
    setSessions(prev => {
      const newMap = new Map(prev);
      const session = newMap.get(jobId);
      if (session) {
        newMap.set(jobId, { ...session, connectionState: state });
      }
      return newMap;
    });
  }, []);

  // Helper function to handle retries with exponential backoff
  const scheduleRetry = useCallback(async (jobId: string, retryFn: () => Promise<void>, errorMessage: string) => {
    const currentAttempts = retryAttempts.current.get(jobId) || 0;

    if (currentAttempts >= MAX_RETRY_ATTEMPTS) {
      showTerminalError(jobId, `Failed after ${MAX_RETRY_ATTEMPTS} attempts: ${errorMessage}`, 'error');
      updateConnectionState(jobId, 'error');
      return;
    }

    const delay = RETRY_DELAYS[currentAttempts] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
    retryAttempts.current.set(jobId, currentAttempts + 1);

    showTerminalError(jobId, `[Reconnection attempt ${currentAttempts + 1}/${MAX_RETRY_ATTEMPTS} in ${delay}ms...]`, 'warning');

    const timeoutId = setTimeout(async () => {
      retryTimeouts.current.delete(jobId);
      try {
        await retryFn();
        // Success - reset retry counter
        retryAttempts.current.delete(jobId);
        showTerminalError(jobId, '[Reconnection successful]', 'warning');
        updateConnectionState(jobId, 'connected');
      } catch (error) {
        console.error(`Retry attempt ${currentAttempts + 1} failed for ${jobId}:`, error);
        // Schedule next retry
        scheduleRetry(jobId, retryFn, errorMessage);
      }
    }, delay);

    retryTimeouts.current.set(jobId, timeoutId);
  }, [showTerminalError, updateConnectionState]);

  // Pre-compile ANSI escape regex for better performance
  const ansiEscapeRegex = useMemo(() => /\x1b\[[0-9;]*m/g, []);

  const stripAnsiEscapes = useCallback((text: string): string => {
    return text.replace(ansiEscapeRegex, '');
  }, [ansiEscapeRegex]);

  const updateLastOutput = useCallback((jobId: string, text: string) => {
    // Use RAF to batch DOM updates
    requestAnimationFrame(() => {
      const cleanText = stripAnsiEscapes(text);
      const lines = cleanText.split('\n').filter(line => line.trim().length > 0);

      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1].slice(0, 200);

        setSessions(prev => {
          const newMap = new Map(prev);
          const session = newMap.get(jobId);
          if (session && session.lastOutput !== lastLine) {
            newMap.set(jobId, { ...session, lastOutput: lastLine });
            return newMap;
          }
          return prev; // No change, avoid re-render
        });
      }
    });
  }, [stripAnsiEscapes]);

  const updateSessionStatus = useCallback((jobId: string, status: TerminalStatus, exitCode?: number) => {
    setSessions(prev => {
      const newMap = new Map(prev);
      const session = newMap.get(jobId);
      if (session) {
        newMap.set(jobId, { ...session, status, exitCode });
      }
      return newMap;
    });

    // Clear attention and dismiss notification when terminal exits
    if (status === 'completed' || status === 'failed') {
      clearAttention(jobId);
    }
  }, [clearAttention]);

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

  // Helper to get session health
  const getSessionHealth = useCallback(async (jobId: string) => {
    try {
      const result = await invoke<{
        healthy: boolean;
        reason?: string;
        recovery_hint?: string;
        pty_alive?: boolean;
        has_clients?: boolean;
      }>('get_session_health_command', { jobId });

      return {
        healthy: result.healthy,
        reason: result.reason,
        recovery_hint: result.recovery_hint,
      };
    } catch (error) {
      console.error(`Failed to get session health for ${jobId}:`, error);
      return {
        healthy: false,
        reason: 'health_check_failed',
        recovery_hint: 'Try restarting the session'
      };
    }
  }, []);

  // Helper to recover session
  const recoverSession = useCallback(async (jobId: string, recoveryType: 'restart_pty' | 'clear_session' | 'force_reconnect') => {
    try {
      updateConnectionState(jobId, 'connecting');
      showTerminalError(jobId, `[Attempting recovery: ${recoveryType}...]`, 'warning');

      const result = await invoke<{
        success: boolean;
        message?: string;
        action?: string;
      }>('recover_terminal_session_command', { jobId, recoveryType });

      if (result.success) {
        showTerminalError(jobId, `[Recovery successful: ${result.message}]`, 'warning');
        updateConnectionState(jobId, 'connected');
        return { success: true, message: result.message };
      } else {
        showTerminalError(jobId, `[Recovery failed: ${result.message}]`, 'error');
        updateConnectionState(jobId, 'error');
        return { success: false, message: result.message };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      showTerminalError(jobId, `[Recovery failed: ${errorMsg}]`, 'error');
      updateConnectionState(jobId, 'error');
      return { success: false, message: errorMsg };
    }
  }, [updateConnectionState, showTerminalError]);

  // Helper to get connection state
  const getConnectionState = useCallback((jobId: string) => {
    return connectionStates.current.get(jobId) || 'disconnected';
  }, []);

  useEffect(() => {
    let unlistenExit: (() => void) | null = null;
    let unlistenReady: (() => void) | null = null;
    let unlistenStatusChanged: (() => void) | null = null;
    let unlistenDeleted: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenExit = await listen("terminal-exit", (event: any) => {
        const { jobId, code } = event.payload;

        // Check if session was already marked as completed (e.g., by manual kill)
        const currentSession = sessionsRef.current.get(jobId);
        if (currentSession?.status === "completed") {
          // Don't override completed status, just update exit code
          updateSessionStatus(jobId, "completed", code);
        } else {
          // Normal exit handling
          updateSessionStatus(jobId, code === 0 ? "completed" : "failed", code);
        }

        const stuckTimeout = stuckTimeoutsRef.current.get(jobId);
        if (stuckTimeout) {
          clearTimeout(stuckTimeout);
          stuckTimeoutsRef.current.delete(jobId);
        }


        // Session ended, status updated above

        channelsRef.current.delete(jobId);
        readyFlagsRef.current.delete(jobId);

        // Clean up refs
        outputBytesCallbacksRef.current.delete(jobId);
        clearInactivityCheck(jobId);
        clearAttention(jobId);
        attentionThrottles.current.delete(jobId);

        // Clean up processing queue
        processingQueue.current.delete(jobId);
        const timeout = processingTimeouts.current.get(jobId);
        if (timeout) {
          clearTimeout(timeout);
          processingTimeouts.current.delete(jobId);
        }

        // Clean up the global reference to prevent memory leak
        delete (window as any)[`__terminal_channel_${jobId}`];

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
          if (s && s.status === 'starting') {
            next.set(rJob, { ...s, status: "running", ready: true });
          }
          return next;
        });
      });

      unlistenStatusChanged = await listen('terminal:status-changed', (event: any) => {
        const { jobId, status, updatedAt } = event.payload;
        if (!jobId || !status) {
          console.warn('terminal:status-changed event missing required fields:', event.payload);
          return;
        }

        setSessions(prev => {
          const next = new Map(prev);
          const session = next.get(jobId);
          if (session) {
            next.set(jobId, {
              ...session,
              status: status,
              lastOutputAt: updatedAt ? new Date(parseInt(updatedAt) * 1000) : session.lastOutputAt,
            });
          }
          return next;
        });
      });

      unlistenDeleted = await listen('terminal:deleted', (event: any) => {
        const { jobId } = event.payload;
        if (!jobId) {
          console.warn('terminal:deleted event missing jobId:', event.payload);
          return;
        }

        setSessions(prev => {
          const next = new Map(prev);
          next.delete(jobId);
          return next;
        });

        // Clean up refs
        channelsRef.current.delete(jobId);
        readyFlagsRef.current.delete(jobId);
        outputBytesCallbacksRef.current.delete(jobId);
        const stuckTimeout = stuckTimeoutsRef.current.get(jobId);
        if (stuckTimeout) {
          clearTimeout(stuckTimeout);
          stuckTimeoutsRef.current.delete(jobId);
        }
        clearInactivityCheck(jobId);
        clearAttention(jobId);
        attentionThrottles.current.delete(jobId);
        processingQueue.current.delete(jobId);
        const timeout = processingTimeouts.current.get(jobId);
        if (timeout) {
          clearTimeout(timeout);
          processingTimeouts.current.delete(jobId);
        }
        delete (window as any)[`__terminal_channel_${jobId}`];
      });
    };

    setupListeners();

    return () => {
      if (unlistenExit) unlistenExit();
      if (unlistenReady) unlistenReady();
      if (unlistenStatusChanged) unlistenStatusChanged();
      if (unlistenDeleted) unlistenDeleted();
    };
  }, [updateSessionStatus, scheduleStuckCheck, clearInactivityCheck, clearAttention]);

  const startSession = useCallback(async (jobId: string, opts?: StartSessionOptions & { onOutput?: (data: string) => void, onConnecting?: () => void, onRestoring?: () => void, onReady?: () => void }) => {
    // Check if we're already starting/running this session
    const existingSession = sessionsRef.current.get(jobId);
    if (existingSession?.status === "starting" || existingSession?.status === "running") {
      return; // Skip duplicate start
    }

    // If session is completed/failed, remove it so we can start fresh
    if (existingSession?.status === "completed" || existingSession?.status === "failed") {
      setSessions(prev => {
        const next = new Map(prev);
        next.delete(jobId);
        return next;
      });
      // Also clean up any references
      channelsRef.current.delete(jobId);
      outputBytesCallbacksRef.current.delete(jobId);
      readyFlagsRef.current.delete(jobId);
      delete (window as any)[`__terminal_channel_${jobId}`];
    }

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
          if (bytes.length === 0) {
            console.log(`Terminal ${jobId}: Received empty bytes`);
            return;
          }
          const bytesCallback = outputBytesCallbacksRef.current.get(jobId);
          if (!bytesCallback) {
            console.warn(`Terminal ${jobId}: No bytes callback registered for output`);
            return;
          }

          // Track first output received and emit custom event
          const hasReceived = hasReceivedOutputRef.current.get(jobId);
          if (!hasReceived) {
            hasReceivedOutputRef.current.set(jobId, true);
            window.dispatchEvent(new CustomEvent('terminal-first-output', { detail: { jobId } }));
            console.log(`Terminal ${jobId}: First output received`);
          }

          // CRITICAL PATH: Send bytes to terminal with proper backpressure handling
          let processingScheduled = false;
          bytesCallback(bytes, () => {
            // onComplete callback - xterm is ready for more data
            // Schedule processing only once per batch
            if (!processingScheduled) {
              processingScheduled = true;

              // NON-BLOCKING: Defer all heavy processing
              queueMicrotask(() => {
                // Decode text for processing
                const text = decoder.decode(bytes, { stream: true });

                // Accumulate text for batch processing
                const existing = processingQueue.current.get(jobId) || '';
                processingQueue.current.set(jobId, existing + text);

                // Clear any existing processing timeout
                const existingTimeout = processingTimeouts.current.get(jobId);
                if (existingTimeout) {
                  clearTimeout(existingTimeout);
                }

                // Batch process after a short delay to accumulate multiple chunks
                const timeoutId = setTimeout(() => {
                  const accumulatedText = processingQueue.current.get(jobId);
                  if (!accumulatedText) return;

                  processingQueue.current.delete(jobId);
                  processingTimeouts.current.delete(jobId);

                  // Use requestIdleCallback for non-critical processing
                  const processNonCritical = () => {
                    // Process accumulated text in one batch
                    updateLastOutput(jobId, accumulatedText);

                    // Store current attention level before detection
                    const currentAttention = attentionMap.current.get(jobId);
                    detectAttentionFromOutput(jobId, accumulatedText);

                    // Clear attention on new output (unless new high attention was just detected)
                    const newAttention = attentionMap.current.get(jobId);
                    if (currentAttention && (!newAttention || newAttention.level !== 'high')) {
                      clearAttention(jobId);
                    }

                    clearInactivityCheck(jobId);
                    scheduleInactivityCheck(jobId);
                    scheduleStuckCheck(jobId);
                  };

                  if ('requestIdleCallback' in window) {
                    (window as any).requestIdleCallback(processNonCritical, { timeout: 100 });
                  } else {
                    setTimeout(processNonCritical, 0);
                  }
                }, 16); // Batch for ~1 frame

                processingTimeouts.current.set(jobId, timeoutId);
              });
            }
          });
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
        // Running sessions: never replay persisted history on attach to avoid duplicate outputs
        // Try to attach to existing running session
        opts?.onRestoring?.();
        showTerminalError(jobId, "[Restoring session...]", 'warning');

        try {
          await invoke("attach_terminal_output_command", {
            jobId,
            output: outputChannel
          });

          // Set ready immediately for existing sessions
          readyFlagsRef.current.set(jobId, true);
          updateConnectionState(jobId, 'connected');
          opts?.onReady?.();

          // Successfully attached to running session
          return;
        } catch (attachError) {
          console.warn(`Failed to attach to existing session ${jobId}:`, attachError);
          showTerminalError(jobId, "[Failed to restore session, starting fresh...]", 'warning');
          // Fall through to start a new session only if not successfully attached
        }
      }
      // Note: completed/failed sessions were already removed above, so they'll get a fresh session

      // Start new session
      opts?.onConnecting?.();
      updateConnectionState(jobId, 'connecting');

      const newSession: TerminalSession = {
        jobId,
        status: "starting",
        lastOutputAt: new Date(),
        connectionState: 'connecting',
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

        updateConnectionState(jobId, 'connected');
        // Session started successfully, terminal-ready event will handle notification
        // The onReady callback will be called when terminal-ready event is received

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

  const write = useCallback(async (jobId: string, data: string) => {
    const bytes = encoder.encode(data);
    try {
      // CRITICAL PATH: Send input immediately
      await invoke('write_terminal_input_command', { jobId, data: Array.from(bytes) });

      // NON-BLOCKING: Schedule state updates
      setTimeout(() => {
        clearAttention(jobId);
        clearInactivityCheck(jobId);
        scheduleInactivityCheck(jobId);
        scheduleStuckCheck(jobId);
      }, 0);
    } catch (error) {
      console.warn(`Failed to write to terminal ${jobId}:`, error);
    }
  }, [encoder, scheduleStuckCheck, clearInactivityCheck, scheduleInactivityCheck, clearAttention]);

  const handleImagePaste = useCallback(async (jobId: string, file: File) => {
    try {
      const session = sessionsRef.current.get(jobId);
      if (!session || session.status !== 'running') {
        throw new Error('Terminal session is not running');
      }

      const buffer = new Uint8Array(await file.arrayBuffer());
      const payload = {
        jobId,
        fileName: file.name || null,
        mimeType: file.type || null,
        data: Array.from(buffer),
      };

      const savedPath = await invoke<string>('save_pasted_image_command', payload);

      const trimmedPath = savedPath.trim();
      if (!trimmedPath) {
        throw new Error('Pasted image path was empty');
      }

      const sanitizedPath = trimmedPath.replace(/"/g, '\\"');
      const needsQuoting = /\s/.test(trimmedPath);
      const safePath = needsQuoting ? `"${sanitizedPath}"` : sanitizedPath;
      await write(jobId, `image:${safePath}\r`);

      showNotification({
        title: 'Image pasted',
        message: `Saved to ${trimmedPath}`,
        type: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showNotification({
        title: 'Image paste failed',
        message,
        type: 'error',
      });
      throw error;
    }
  }, [showNotification, write]);

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
      // Immediately update status to completed to prevent terminal-exit event from setting it to failed
      // (killed processes typically have non-zero exit codes which would incorrectly show as "failed")
      updateSessionStatus(jobId, "completed", 0);
    } catch (error) {
      // Silent error handling
    }
  }, [sessions, updateSessionStatus]);

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

  const getAttention = useCallback((jobId: string): AttentionState | undefined => {
    return attentionMap.current.get(jobId);
  }, []);

  const getAttentionCount = useCallback((): number => {
    return Array.from(attentionMap.current.values()).filter(a => a.level !== 'none').length;
  }, []);

  const subscribeAttention = useCallback((cb: (map: Map<string, AttentionState>) => void): (() => void) => {
    attentionSubscribers.current.add(cb);
    return () => {
      attentionSubscribers.current.delete(cb);
    };
  }, []);

  useEffect(() => {
    return () => {
      // Clear timeouts
      for (const timeoutId of stuckTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      for (const timeoutId of inactivityTimeouts.current.values()) {
        clearTimeout(timeoutId);
      }

      // Clear all refs
      stuckTimeoutsRef.current.clear();
      inactivityTimeouts.current.clear();
      attentionThrottles.current.clear();
      channelsRef.current.clear();
      readyFlagsRef.current.clear();
      outputBytesCallbacksRef.current.clear();
      attentionMap.current.clear();
      attentionSubscribers.current.clear();

      // Clear processing queue and timeouts
      for (const timeoutId of processingTimeouts.current.values()) {
        clearTimeout(timeoutId);
      }
      processingQueue.current.clear();
      processingTimeouts.current.clear();
    };
  }, []);

  // Session recovery on mount - fetch active sessions from backend
  useEffect(() => {
    const recoverActiveSessions = async () => {
      try {
        const activeSessions = await invoke("list_active_terminal_sessions_command") as Array<{ jobId: string; status: string; processId?: number; createdAt: number; lastOutputAt?: number; workingDirectory?: string; title?: string }>;
        console.log("Found active sessions:", activeSessions);

        // Update local sessions state with recovered sessions
        setSessions(prev => {
          const next = new Map(prev);
          for (const session of activeSessions) {
            const existingSession = next.get(session.jobId);
            if (!existingSession) {
              // Add recovered session with disconnected state initially
              next.set(session.jobId, {
                jobId: session.jobId,
                status: "running" as TerminalStatus,
                lastOutputAt: session.lastOutputAt ? new Date(session.lastOutputAt * 1000) : new Date(),
                connectionState: "disconnected",
                ready: false
              });
            }
          }
          return next;
        });
      } catch (error) {
        console.warn("Failed to recover active sessions:", error);
      }
    };

    // Run recovery after a short delay to allow context initialization
    const timeoutId = setTimeout(recoverActiveSessions, 100);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    for (const job of jobs) {
      if (job.subStatusMessage) {
        const message = job.subStatusMessage.toLowerCase();
        if (message.includes('user input') || message.includes('awaiting input')) {
          setAttention(job.id, 'high', 'User input required');
        }
      }
    }
  }, [jobs, setAttention]);

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
    handleImagePaste,
    getAttention,
    getAttentionCount,
    subscribeAttention,
    getSessionHealth,
    recoverSession,
    getConnectionState,
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
    handleImagePaste,
    getAttention,
    getAttentionCount,
    subscribeAttention,
    getSessionHealth,
    recoverSession,
    getConnectionState,
  ]);

  return (
    <TerminalSessionsContext.Provider value={contextValue}>
      {children}
    </TerminalSessionsContext.Provider>
  );
}

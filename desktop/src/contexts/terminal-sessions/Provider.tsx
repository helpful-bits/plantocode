"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { Channel } from "@tauri-apps/api/core";
import { invoke } from "@/utils/tauri-invoke-wrapper";
import { useNotification } from "@/contexts/notification-context";
import {
  startTerminalSession,
  attachTerminalOutput,
  writeTerminalInput,
  resizeTerminal,
  killTerminal,
  readTerminalLogLen,
  readTerminalLogSince
} from '@/actions/terminal';

import type {
  TerminalSession,
  TerminalStatus,
  StartSessionOptions,
  TerminalSessionsContextShape,
  AttentionState,
  AttentionLevel,
} from "./types";
import type { HealthCheckResult } from "./useTerminalHealth";
import { useBackgroundJobs } from "../background-jobs";

const AGENT_ATTENTION_TIMEOUT_MS = 2 * 60 * 1000;
const INACTIVITY_LEVEL1_MS = 30 * 1000; // Level 1: Agent Idle (30 seconds)
const INACTIVITY_LEVEL2_MS = 2 * 60 * 1000; // Level 2: Agent Requires Attention (2 minutes)
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [100, 500, 2000];
const unknownShapeWarnings = new Set<string>();

function normalizeToUint8Array(chunk: any): Uint8Array {
  // Handle strings first - check if it's base64 encoded
  if (typeof chunk === 'string') {
    try {
      // Try to decode as base64 first (from Rust backend)
      const decoded = atob(chunk);
      const bytes = new Uint8Array(decoded.length);
      for (let i = 0; i < decoded.length; i++) {
        bytes[i] = decoded.charCodeAt(i);
      }
      return bytes;
    } catch {
      // Not base64, encode as UTF-8
      return new TextEncoder().encode(chunk);
    }
  }

  // Fast path for most common case
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);

  // Handle DataView
  if (chunk instanceof DataView) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }

  // Handle other typed arrays
  if (chunk && chunk.buffer instanceof ArrayBuffer && 'byteOffset' in chunk && 'byteLength' in chunk) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }

  // Handle Tauri's array format with value clamping
  if (Array.isArray(chunk)) {
    const result = new Uint8Array(chunk.length);
    for (let i = 0; i < chunk.length; i++) {
      // Clamp values to 0-255 range
      result[i] = (Number(chunk[i]) & 0xff) >>> 0;
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
        // Clamp values to 0-255 range
        result[i] = (Number(chunk.data[i]) & 0xff) >>> 0;
      }
      return result;
    }
  }

  // Warn once for unknown shapes
  const shapeKey = typeof chunk + '_' + (chunk?.constructor?.name || 'unknown');
  if (!unknownShapeWarnings.has(shapeKey)) {
    unknownShapeWarnings.add(shapeKey);
    console.warn('Unknown chunk shape in normalizeToUint8Array:', shapeKey, chunk);
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
  getSessionHealth: async () => ({
    jobId: '',
    status: { type: 'disconnected' },
    lastCheck: Date.now(),
    recoveryAttempts: 0,
    processAlive: false,
    outputChannelActive: false,
    persistenceQueueSize: 0,
  } as HealthCheckResult),
  recoverSession: async () => ({ success: false }),
  getConnectionState: () => 'disconnected',
  detachSession: () => {},
});

export function TerminalSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, TerminalSession>>(new Map());
  const sessionsRef = useRef<Map<string, TerminalSession>>(new Map());
  const agentAttentionTimeoutsRef = useRef<Map<string, number>>(new Map());
  const outputBytesCallbacksRef = useRef<Map<string, (data: Uint8Array, onComplete: () => void) => void>>(new Map());
  const channelsRef = useRef<Map<string, Channel<any>>>(new Map());
  const readyFlagsRef = useRef<Map<string, boolean>>(new Map());
  const attentionMap = useRef<Map<string, AttentionState>>(new Map());
  const attentionSubscribers = useRef<Set<(map: Map<string, AttentionState>) => void>>(new Set());
  const inactivityLevel1Timeouts = useRef<Map<string, number>>(new Map());
  const inactivityLevel2Timeouts = useRef<Map<string, number>>(new Map());
  const lastOutputTimestamps = useRef<Map<string, number>>(new Map());
  const logCursorRef = useRef<Map<string, number>>(new Map());
  const processingQueue = useRef<Map<string, string>>(new Map());
  const processingTimeouts = useRef<Map<string, number>>(new Map());
  const retryAttempts = useRef<Map<string, number>>(new Map());
  const connectionStates = useRef<Map<string, 'connected' | 'connecting' | 'disconnected' | 'error'>>(new Map());
  const retryTimeouts = useRef<Map<string, number>>(new Map());
  const hasReceivedOutputRef = useRef<Map<string, boolean>>(new Map());
  const outputUpdateTimeouts = useRef<Map<string, number>>(new Map());
  const pendingOutputUpdates = useRef<Map<string, string>>(new Map());

  const decodersRef = useRef<Map<string, TextDecoder>>(new Map());

  const getDecoder = useCallback((jobId: string): TextDecoder => {
    if (!decodersRef.current.has(jobId)) {
      decodersRef.current.set(jobId, new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }));
    }
    return decodersRef.current.get(jobId)!;
  }, []);

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
        title: "Agent requires attention",
        message: "Agent requires attention - check terminal",
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


  const scheduleInactivityCheck = useCallback((jobId: string) => {
    // Clear existing timeouts
    const existingLevel1 = inactivityLevel1Timeouts.current.get(jobId);
    const existingLevel2 = inactivityLevel2Timeouts.current.get(jobId);
    if (existingLevel1) {
      window.clearTimeout(existingLevel1);
    }
    if (existingLevel2) {
      window.clearTimeout(existingLevel2);
    }

    // Update last output timestamp
    lastOutputTimestamps.current.set(jobId, Date.now());

    // Schedule Level 1 inactivity check (30 seconds)
    const level1TimeoutId = window.setTimeout(() => {
      const session = sessionsRef.current.get(jobId);
      if (session && session.status === 'running') {
        setAttention(jobId, 'medium', 'Agent idle - may have completed task');
      }
      inactivityLevel1Timeouts.current.delete(jobId);
    }, INACTIVITY_LEVEL1_MS);

    // Schedule Level 2 inactivity check (2 minutes)
    const level2TimeoutId = window.setTimeout(async () => {
      const session = sessionsRef.current.get(jobId);
      if (session && session.status === 'running') {
        setAttention(jobId, 'high', 'Agent requires attention - check terminal');

        // Show desktop notification for Level 2
        try {
          if (window.__TAURI__?.notification?.sendNotification) {
            await window.__TAURI__.notification.sendNotification({
              title: 'Agent Requires Attention',
              body: 'Terminal has been inactive for 2 minutes - check terminal',
            });
          }
        } catch (error) {
          console.warn('Failed to send desktop notification:', error);
        }
      }
      inactivityLevel2Timeouts.current.delete(jobId);
    }, INACTIVITY_LEVEL2_MS);

    inactivityLevel1Timeouts.current.set(jobId, level1TimeoutId);
    inactivityLevel2Timeouts.current.set(jobId, level2TimeoutId);
  }, [setAttention]);

  const clearInactivityCheck = useCallback((jobId: string) => {
    const existingLevel1 = inactivityLevel1Timeouts.current.get(jobId);
    const existingLevel2 = inactivityLevel2Timeouts.current.get(jobId);

    if (existingLevel1) {
      window.clearTimeout(existingLevel1);
      inactivityLevel1Timeouts.current.delete(jobId);
    }

    if (existingLevel2) {
      window.clearTimeout(existingLevel2);
      inactivityLevel2Timeouts.current.delete(jobId);
    }

    // Update last output timestamp when clearing
    lastOutputTimestamps.current.set(jobId, Date.now());
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
    const currentState = connectionStates.current.get(jobId);

    // Skip if state hasn't changed
    if (currentState === state) {
      return;
    }

    connectionStates.current.set(jobId, state);
    setSessions(prev => {
      const newMap = new Map(prev);
      const session = newMap.get(jobId);
      if (session && session.connectionState !== state) {
        newMap.set(jobId, { ...session, connectionState: state });
        return newMap;
      }
      return prev; // No change, avoid re-render
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

    const timeoutId = window.setTimeout(async () => {
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
    // Store the pending update
    pendingOutputUpdates.current.set(jobId, text);

    // Clear existing timeout if any
    const existingTimeout = outputUpdateTimeouts.current.get(jobId);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    // Debounce updates - only update after 100ms of no new output
    const timeoutId = window.setTimeout(() => {
      const pendingText = pendingOutputUpdates.current.get(jobId);
      if (!pendingText) return;

      // Use RAF to batch DOM updates
      requestAnimationFrame(() => {
        const cleanText = stripAnsiEscapes(pendingText);
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

        // Clear pending update
        pendingOutputUpdates.current.delete(jobId);
        outputUpdateTimeouts.current.delete(jobId);
      });
    }, 100); // 100ms debounce

    outputUpdateTimeouts.current.set(jobId, timeoutId);
  }, [stripAnsiEscapes]);

  const updateSessionStatus = useCallback((jobId: string, status: TerminalStatus, exitCode?: number) => {
    setSessions(prev => {
      const newMap = new Map(prev);
      const session = newMap.get(jobId);
      if (session && (session.status !== status || session.exitCode !== exitCode)) {
        newMap.set(jobId, { ...session, status, exitCode });
        return newMap;
      }
      return prev; // No change, avoid re-render
    });

    // Clear attention and dismiss notification when terminal exits
    if (status === 'completed' || status === 'failed') {
      clearAttention(jobId);
    }
  }, [clearAttention]);

  const scheduleAgentAttentionCheck = useCallback((jobId: string) => {
    const existingTimeout = agentAttentionTimeoutsRef.current.get(jobId);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    const timeoutId = window.setTimeout(() => {
      const session = sessionsRef.current.get(jobId);
      if (session && session.status === "running") {
        updateSessionStatus(jobId, "agent_requires_attention");
      }
      agentAttentionTimeoutsRef.current.delete(jobId);
    }, AGENT_ATTENTION_TIMEOUT_MS);

    agentAttentionTimeoutsRef.current.set(jobId, timeoutId);
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
    // Flush any pending processing queue data
    const pendingText = processingQueue.current.get(jobId);
    if (pendingText) {
      updateLastOutput(jobId, pendingText);
      processingQueue.current.delete(jobId);
    }

    // Clear any pending timeout
    const timeout = processingTimeouts.current.get(jobId);
    if (timeout) {
      window.clearTimeout(timeout);
      processingTimeouts.current.delete(jobId);
    }

    // Remove the callback
    outputBytesCallbacksRef.current.delete(jobId);

    // Clean up decoder
    decodersRef.current.delete(jobId);
  }, [updateLastOutput]);

  const resize = useCallback(async (jobId: string, cols: number, rows: number) => {
    try {
      await resizeTerminal(jobId, cols, rows);
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
          type: "warning",
          title: "Authentication Required",
          message: "Please log in for full terminal functionality",
        });
        if (onOutput) {
          onOutput("\x1b[33mWarning: Please log in for full terminal functionality\x1b[0m\r\n");
        }
      }

      if (!result.serverSelected) {
        showNotification({
          type: "warning",
          title: "Server Not Selected",
          message: "Please select a server region for full terminal functionality",
        });
        if (onOutput) {
          onOutput("\x1b[33mWarning: Please select a server region for full terminal functionality\x1b[0m\r\n");
        }
      }

      if (!result.apiClientsReady) {
        showNotification({
          type: "warning",
          title: "API Not Ready",
          message: "API clients are not ready, some features may not work",
        });
        if (onOutput) {
          onOutput("\x1b[33mWarning: API clients are not ready, some features may not work\x1b[0m\r\n");
        }
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
      const result = await invoke<HealthCheckResult>('get_terminal_health_status', { jobId });
      return result;
    } catch (error) {
      console.error(`Failed to get session health for ${jobId}:`, error);
      return {
        jobId,
        status: { type: 'disconnected' },
        lastCheck: Date.now(),
        recoveryAttempts: 0,
        processAlive: false,
        outputChannelActive: false,
        persistenceQueueSize: 0,
      } as HealthCheckResult;
    }
  }, []);

  // Helper to recover session
  const recoverSession = useCallback(async (jobId: string, recoveryType: 'restart_pty' | 'clear_session' | 'force_reconnect') => {
    try {
      updateConnectionState(jobId, 'connecting');
      showTerminalError(jobId, `[Attempting recovery: ${recoveryType}...]`, 'warning');

      if (recoveryType === 'force_reconnect') {
        // Use touch_session_by_job_id for force_reconnect
        await invoke('touch_session_by_job_id', { jobId });
        showTerminalError(jobId, '[Force reconnect successful]', 'warning');
        updateConnectionState(jobId, 'connected');
        return { success: true, message: 'Force reconnect successful' };
      } else {
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

  const detachSession = useCallback((jobId: string) => {
    const ch = channelsRef.current.get(jobId);
    if (ch) {
      // Properly clear the onmessage handler
      ch.onmessage = () => {};
      channelsRef.current.delete(jobId);
    }
    removeOutputBytesCallback(jobId);
    updateConnectionState(jobId, 'disconnected');
    // Clean up cursor entry
    logCursorRef.current.delete(jobId);
  }, [removeOutputBytesCallback, updateConnectionState]);

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

        const agentAttentionTimeout = agentAttentionTimeoutsRef.current.get(jobId);
        if (agentAttentionTimeout) {
          window.clearTimeout(agentAttentionTimeout);
          agentAttentionTimeoutsRef.current.delete(jobId);
        }


        // Session ended, status updated above
        const ch = channelsRef.current.get(jobId);
        if (ch) {
          ch.onmessage = () => {};
        }
        channelsRef.current.delete(jobId);
        readyFlagsRef.current.delete(jobId);

        // Clean up refs
        outputBytesCallbacksRef.current.delete(jobId);
        clearInactivityCheck(jobId);
        clearAttention(jobId);
        lastOutputTimestamps.current.delete(jobId);

        // Clean up decoder to prevent memory leak
        decodersRef.current.delete(jobId);

        // Clean up processing queue
        processingQueue.current.delete(jobId);
        const timeout = processingTimeouts.current.get(jobId);
        if (timeout) {
          window.clearTimeout(timeout);
          processingTimeouts.current.delete(jobId);
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
        updateConnectionState(rJob, 'connected');

        setSessions(prev => {
          const next = new Map(prev);
          const s = next.get(rJob);
          if (s && s.status === 'starting') {
            next.set(rJob, { ...s, status: "running", ready: true });
            return next;
          }
          return prev; // No change, avoid re-render
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
        const ch = channelsRef.current.get(jobId);
        if (ch) {
          ch.onmessage = () => {};
        }
        channelsRef.current.delete(jobId);
        readyFlagsRef.current.delete(jobId);
        outputBytesCallbacksRef.current.delete(jobId);
        const agentAttentionTimeout = agentAttentionTimeoutsRef.current.get(jobId);
        if (agentAttentionTimeout) {
          window.clearTimeout(agentAttentionTimeout);
          agentAttentionTimeoutsRef.current.delete(jobId);
        }
        clearInactivityCheck(jobId);
        clearAttention(jobId);
        lastOutputTimestamps.current.delete(jobId);
        processingQueue.current.delete(jobId);

        // Clean up decoder to prevent memory leak
        decodersRef.current.delete(jobId);
        const timeout = processingTimeouts.current.get(jobId);
        if (timeout) {
          window.clearTimeout(timeout);
          processingTimeouts.current.delete(jobId);
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenExit) unlistenExit();
      if (unlistenReady) unlistenReady();
      if (unlistenStatusChanged) unlistenStatusChanged();
      if (unlistenDeleted) unlistenDeleted();
    };
  }, [updateSessionStatus, scheduleAgentAttentionCheck, clearInactivityCheck, clearAttention]);

  const startSession = useCallback(async (jobId: string, opts?: StartSessionOptions & { onOutput?: (data: string) => void, onConnecting?: () => void, onRestoring?: () => void, onReady?: () => void }) => {
    // Check if we're already starting/running this session
    const existingSession = sessionsRef.current.get(jobId);
    if (existingSession) {
      const connectionState = connectionStates.current.get(jobId) ?? existingSession.connectionState ?? 'disconnected';
      const hasActiveChannel = channelsRef.current.has(jobId);

      const isStartingAndHealthy =
        existingSession.status === "starting" && (connectionState === 'connecting' || (connectionState === 'connected' && hasActiveChannel));
      const isRunningAndHealthy =
        existingSession.status === "running" && connectionState === 'connected' && hasActiveChannel;

      if (isStartingAndHealthy || isRunningAndHealthy) {
        return; // Session already active with a live channel
      }

      if (existingSession.status === "running" && !hasActiveChannel) {
        console.debug(`Re-attaching to terminal session ${jobId} (channel detached)`);
      }
    }

    // If session is completed/failed, just clean up local state
    // The backend will handle reusing the database record when starting a new session
    if (existingSession?.status === "completed" || existingSession?.status === "failed") {
      console.log(`Cleaning up local state for ended session ${jobId}`);

      // Clean up local state
      setSessions(prev => {
        const next = new Map(prev);
        next.delete(jobId);
        return next;
      });

      // Clean up references
      const ch = channelsRef.current.get(jobId);
      if (ch) {
        ch.onmessage = () => {};
      }
      channelsRef.current.delete(jobId);
      outputBytesCallbacksRef.current.delete(jobId);
      readyFlagsRef.current.delete(jobId);
      logCursorRef.current.delete(jobId);

      // Don't try to delete from backend - let start_session handle database state
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
                let text: string;
                try {
                  text = getDecoder(jobId).decode(bytes, { stream: true });
                } catch (err) {
                  console.warn("UTF-8 decode error for job", jobId, err);
                  // Fallback to non-fatal decoding for UI display
                  const safeDecoder = new TextDecoder('utf-8', { fatal: false });
                  text = safeDecoder.decode(bytes, { stream: true });
                }

                // Accumulate text for batch processing
                const existing = processingQueue.current.get(jobId) || '';
                processingQueue.current.set(jobId, existing + text);

                // Clear any existing processing timeout
                const existingTimeout = processingTimeouts.current.get(jobId);
                if (existingTimeout) {
                  window.clearTimeout(existingTimeout);
                }

                // Batch process after a short delay to accumulate multiple chunks
                const timeoutId = window.setTimeout(() => {
                  const accumulatedText = processingQueue.current.get(jobId);
                  if (!accumulatedText) return;

                  processingQueue.current.delete(jobId);
                  processingTimeouts.current.delete(jobId);

                  // Use requestIdleCallback for non-critical processing
                  const processNonCritical = () => {
                    // Process accumulated text in one batch
                    updateLastOutput(jobId, accumulatedText);

                    // Clear attention on new output
                    clearAttention(jobId);

                    clearInactivityCheck(jobId);
                    scheduleInactivityCheck(jobId);
                    scheduleAgentAttentionCheck(jobId);
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

      // Optional snapshot prefetch
      try {
        const snap: number[] = await invoke("get_terminal_snapshot_command", { jobId }, { suppressErrorLog: true });
        if (snap?.length && outputBytesCallbacksRef.current.has(jobId)) {
          const cb = outputBytesCallbacksRef.current.get(jobId)!;
          cb(new Uint8Array(snap), () => {});
        }
      } catch {
        // Snapshot not available yet, ignore
      }

      // ATTACH-FIRST APPROACH: Only try attach if there's reason to believe the session exists
      const shouldTryAttach = existingSession && (
        // Try attach for sessions recovered from backend (status "running", not connected)
        (existingSession.status === "running" && existingSession.connectionState === "disconnected") ||
        // Try attach for sessions that are starting but not yet connected
        (existingSession.status === "starting" && existingSession.connectionState !== "connected") ||
        // Try attach for sessions that were running but lost connection
        (existingSession.status === "running" && !channelsRef.current.has(jobId))
      );

      if (shouldTryAttach) {
        try {
          // Try to attach to existing running session
          console.debug(`Attempting to attach to existing session ${jobId}`);
          opts?.onRestoring?.();
          await attachTerminalOutput(jobId, outputChannel);

          // Successful attach - seed cursor but DO NOT write DB tail to avoid duplication
          const logLen = await readTerminalLogLen(jobId).catch(() => 0);
          logCursorRef.current.set(jobId, Math.max(0, logLen));

          // Set ready immediately for attached sessions
          readyFlagsRef.current.set(jobId, true);
          updateConnectionState(jobId, 'connected');
          setSessions(prev => {
            const next = new Map(prev);
            const s = next.get(jobId);
            if (s) {
              next.set(jobId, { ...s, status: "running", ready: true, connectionState: 'connected' });
            }
            return next;
          });
          opts?.onReady?.();

          // Successfully attached - return early
          return;
        } catch (attachError) {
          console.debug(`Attach failed for ${jobId}, starting fresh:`, attachError);
          showTerminalError(jobId, "[Restoring session failed, starting fresh...]", 'warning');
          // Fall through to start new session
        }
      }
      // Note: completed/failed sessions were already removed above, so they'll get a fresh session

      // If attach failed or no existing session, start new one
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
      scheduleAgentAttentionCheck(jobId);

      try {
        await startTerminalSession(
          jobId,
          {
            workingDirectory: opts?.workingDir || ".",
            environment: opts?.env || {},
            rows: opts?.rows || 24,
            cols: opts?.cols || 80,
          },
          outputChannel
        );

        updateConnectionState(jobId, 'connected');

        // After successful start, seed the cursor
        const logLen = await readTerminalLogLen(jobId).catch(() => 0);
        logCursorRef.current.set(jobId, Math.max(0, logLen));

        // Session started successfully, terminal-ready event will handle notification
        // The onReady callback will be called when terminal-ready event is received

      } catch (invokeError) {
        console.error('Failed to start terminal session:', invokeError);
        showTerminalError(jobId, `Start failed: ${String(invokeError)}`);

        // Clean up on failure
        const ch = channelsRef.current.get(jobId);
        if (ch) {
          ch.onmessage = () => {};
        }
        channelsRef.current.delete(jobId);
        outputBytesCallbacksRef.current.delete(jobId);
        readyFlagsRef.current.delete(jobId);
        updateConnectionState(jobId, 'error');

        throw invokeError;
      }
    } catch (error) {
      updateSessionStatus(jobId, "failed");
      updateConnectionState(jobId, 'error');
      showTerminalError(jobId, `Session failed: ${String(error)}`);

      showNotification({
        title: "Terminal Session Failed",
        message: `Failed to start terminal session: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    }
  }, [sessions, setOutputCallback, scheduleAgentAttentionCheck, updateSessionStatus, canOpenTerminal, showNotification]);

  const write = useCallback(async (jobId: string, data: string) => {
    if (typeof data === 'string') {
      if (data === "") return;
    }

    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    if (!bytes || bytes.length === 0) return;

    try {
      const MAX = 8192;
      for (let i = 0; i < bytes.length; i += MAX) {
        const chunk = Array.from(bytes.slice(i, i + MAX));
        await writeTerminalInput(jobId, new Uint8Array(chunk));
      }

      // NON-BLOCKING: Schedule state updates
      setTimeout(() => {
        clearAttention(jobId);
        clearInactivityCheck(jobId);
        scheduleInactivityCheck(jobId);
        scheduleAgentAttentionCheck(jobId);
      }, 0);
    } catch (err) {
      console.error(`Failed to write to terminal ${jobId}:`, err);
      showTerminalError(jobId, `Write failed: ${String(err)}`);
    }
  }, [scheduleAgentAttentionCheck, clearInactivityCheck, scheduleInactivityCheck, clearAttention, showTerminalError]);

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
      await killTerminal(jobId);
      // Immediately update status to completed to prevent terminal-exit event from setting it to failed
      // (killed processes typically have non-zero exit codes which would incorrectly show as "failed")
      updateSessionStatus(jobId, "completed", 0);
    } catch (error) {
      console.error(`Failed to kill terminal ${jobId}:`, error);
      showTerminalError(jobId, `Kill failed: ${String(error)}`);
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
      if (session.status === "running" && session.connectionState === "connected") {
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
      for (const timeoutId of agentAttentionTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      for (const timeoutId of inactivityLevel1Timeouts.current.values()) {
        window.clearTimeout(timeoutId);
      }
      for (const timeoutId of inactivityLevel2Timeouts.current.values()) {
        window.clearTimeout(timeoutId);
      }

      // Clear all refs
      agentAttentionTimeoutsRef.current.clear();
      inactivityLevel1Timeouts.current.clear();
      inactivityLevel2Timeouts.current.clear();
      lastOutputTimestamps.current.clear();
      logCursorRef.current.clear();
      channelsRef.current.clear();
      readyFlagsRef.current.clear();
      outputBytesCallbacksRef.current.clear();
      attentionMap.current.clear();
      attentionSubscribers.current.clear();

      // Clear processing queue and timeouts
      for (const timeoutId of processingTimeouts.current.values()) {
        window.clearTimeout(timeoutId);
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

  // Visibility-aware catch-up for minimized/restored sessions
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        // When hidden, refresh cursor for all connected sessions
        for (const [jobId, session] of sessions.entries()) {
          if (session.status === 'running' && connectionStates.current.get(jobId) === 'connected') {
            try {
              const len = await readTerminalLogLen(jobId);
              logCursorRef.current.set(jobId, len);
            } catch (err) {
              console.debug(`Failed to refresh cursor for ${jobId}:`, err);
            }
          }
        }
      } else if (document.visibilityState === 'visible') {
        // When visible, fetch delta for all connected sessions
        for (const [jobId, session] of sessions.entries()) {
          if (session.status === 'running' && connectionStates.current.get(jobId) === 'connected') {
            const cursor = logCursorRef.current.get(jobId);
            if (cursor !== undefined) {
              try {
                const result = await readTerminalLogSince(jobId, cursor, 2 * 1024 * 1024);
                if (result.chunk && result.chunk.length > 0) {
                  const bytesCallback = outputBytesCallbacksRef.current.get(jobId);
                  if (bytesCallback) {
                    const bytes = new TextEncoder().encode(result.chunk);
                    bytesCallback(bytes, () => {});
                  }
                }
                // Update cursor to new position
                logCursorRef.current.set(jobId, result.totalLen);
              } catch (err) {
                console.warn(`Failed to fetch delta for ${jobId}:`, err);
              }
            }
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessions]);

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
    detachSession,
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
    detachSession,
  ]);

  return (
    <TerminalSessionsContext.Provider value={contextValue}>
      {children}
    </TerminalSessionsContext.Provider>
  );
}

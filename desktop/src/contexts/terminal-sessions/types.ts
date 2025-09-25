"use client";

import type { HealthCheckResult } from './useTerminalHealth';

export type TerminalStatus = "starting" | "idle" | "running" | "completed" | "failed" | "agent_requires_attention" | "recovering" | "disconnected";

export type AttentionLevel = 'none' | 'low' | 'medium' | 'high';

export interface AttentionState {
  level: AttentionLevel;
  message: string;
  lastDetectedAt: number;
}

export interface TerminalSession {
  jobId: string;
  status: TerminalStatus;
  lastOutputAt?: Date;
  exitCode?: number;
  lastOutput?: string;
  ready?: boolean;
  // New error tracking fields
  lastError?: string;
  recoveryAttempts?: number;
  connectionState?: 'connected' | 'connecting' | 'disconnected' | 'error';
  healthStatus?: HealthCheckResult;
}

export interface StartSessionOptions {
  workingDir?: string;
  env?: Record<string, string>;
  rows?: number;
  cols?: number;
}

export interface TerminalSessionsContextShape {
  sessions: Map<string, TerminalSession>;
  canOpenTerminal: () => Promise<{ ok: boolean; reason?: "auth" | "region" | "api"; message?: string }>;
  startSession: (jobId: string, opts?: StartSessionOptions & { onOutput?: (data: string) => void }) => Promise<void>;
  write: (jobId: string, data: string) => Promise<void>;
  sendCtrlC: (jobId: string) => Promise<void>;
  kill: (jobId: string) => Promise<void>;
  clearLog: (jobId: string) => Promise<void>;
  deleteLog: (jobId: string) => Promise<void>;
  getStatus: (jobId: string) => TerminalStatus;
  getActiveCount: () => number;
  getSession: (jobId: string) => TerminalSession | undefined;
  setOutputCallback: (jobId: string, callback: (data: string) => void) => void;
  removeOutputCallback: (jobId: string) => void;
  setOutputBytesCallback: (jobId: string, cb: (data: Uint8Array, onComplete: () => void) => void) => void;
  removeOutputBytesCallback: (jobId: string) => void;
  resize: (jobId: string, cols: number, rows: number) => Promise<void>;
  handleImagePaste: (jobId: string, file: File) => Promise<void>;
  getAttention: (jobId: string) => AttentionState | undefined;
  getAttentionCount: () => number;
  subscribeAttention: (cb: (map: Map<string, AttentionState>) => void) => () => void;
  // New error handling and recovery methods
  getSessionHealth: (jobId: string) => Promise<HealthCheckResult>;
  recoverSession: (jobId: string, recoveryType: 'restart_pty' | 'clear_session' | 'force_reconnect') => Promise<{ success: boolean; message?: string }>;
  getConnectionState: (jobId: string) => 'connected' | 'connecting' | 'disconnected' | 'error';
  detachSession: (jobId: string) => void;
}

"use client";

export type TerminalStatus = "starting" | "idle" | "running" | "completed" | "failed" | "stuck";

export interface TerminalSession {
  jobId: string;
  status: TerminalStatus;
  lastOutputAt?: Date;
  exitCode?: number;
  lastOutput?: string;
  ready?: boolean;
}

export interface StartSessionOptions {
  workingDir?: string;
  env?: Record<string, string>;
  rows?: number;
  cols?: number;
}

export interface TerminalSessionsContextShape {
  sessions: Map<string, TerminalSession>;
  canOpenTerminal: () => Promise<{ ok: boolean; reason?: "auth" | "region" | "api" | "mobile"; message?: string }>;
  startSession: (jobId: string, opts?: StartSessionOptions & { onOutput?: (data: string) => void }) => Promise<void>;
  write: (jobId: string, data: string) => void;
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
}
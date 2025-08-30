"use client";

export type TerminalStatus = "idle" | "running" | "completed" | "failed" | "stuck";

export interface TerminalSession {
  jobId: string;
  status: TerminalStatus;
  lastOutputAt?: Date;
  exitCode?: number;
  lastOutput?: string; // Latest output chunk for real-time display
}

export interface StartSessionOptions {
  workingDir?: string;
  env?: Record<string, string>;
  rows?: number;
  cols?: number;
}

export interface TerminalSessionsContextShape {
  sessions: Map<string, TerminalSession>;
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
}
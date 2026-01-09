export type TerminalStatus =
  | 'idle'
  | 'starting'
  | 'initializing'
  | 'running'
  | 'completed'
  | 'failed'
  | 'agent_requires_attention'
  | 'recovering'
  | 'disconnected'
  | 'stuck'
  | 'stopped'
  | 'restored';

export interface AttentionState {
  level: 'low' | 'medium' | 'high';
  message: string;
  lastDetectedAt: number;
}

export interface TerminalSession {
  sessionId: string;
  status: TerminalStatus;
  exitCode?: number;
  lastOutput?: string;
  lastActivityAt?: number;
  displayName?: string;
  origin?: 'plan' | 'task' | 'adhoc' | string;
  jobId?: string;
  isMinimized?: boolean;
}

export interface TerminalSessionsContextShape {
  sessions: Map<string, TerminalSession>;
  startSession: (sessionId: string, opts?: {
    workingDirectory?: string;
    cols?: number;
    rows?: number;
    displayName?: string;
    origin?: 'plan' | 'task' | 'adhoc' | string;
    jobId?: string;
    initialInput?: string;
  }) => Promise<void>;
  attachSession: (sessionId: string) => Promise<void>;
  detachSession: (sessionId: string) => void;
  write: (sessionId: string, data: string | Uint8Array) => void;
  resize: (sessionId: string, cols: number, rows: number) => void;
  kill: (sessionId: string) => void;
  minimizeSession: (sessionId: string) => void;
  setVisibleSessionId: (sessionId: string | null) => void;
  getVisibleSessionId: () => string | null;
  setOutputBytesCallback: (sessionId: string, cb: (chunk: Uint8Array) => void) => void;
  removeOutputBytesCallback: (sessionId: string) => void;
  getSession: (sessionId: string) => TerminalSession | undefined;
  cleanupTerminal: (sessionId: string) => void;
  // Legacy compatibility methods (stub implementations)
  getActiveCount: () => number;
  getAttention: (sessionId: string) => AttentionState | undefined;
  getAttentionCount: () => number;
  deleteLog: (sessionId: string) => Promise<void>;
  // Terminal stability/hydration methods
  getHydratedSnapshotBytes: (sessionId: string, maxBytes?: number) => Uint8Array;
  getLastActivityAt: (sessionId: string) => number | undefined;
  ensureSessionReady: (sessionId: string, opts?: {
    workingDirectory?: string;
    cols?: number;
    rows?: number;
    displayName?: string;
    origin?: 'plan' | 'task' | 'adhoc' | string;
    jobId?: string;
    initialInput?: string;
  }) => Promise<void>;
}

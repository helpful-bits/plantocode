"use client";
import React, { createContext, useCallback, useContext, useMemo, useEffect } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  attachTerminalOutput,
  killTerminal,
  resizeTerminal,
  startTerminalSession,
  writeTerminalInput,
  getActiveTerminalSessions,
  reconnectTerminalSession,
  getTerminalStatus
} from "@/actions/terminal/terminal.actions";
import { safeListen } from "@/utils/tauri-event-utils";
import type { TerminalSessionsContextShape, TerminalSession, TerminalStatus } from "./types";

const INACTIVITY_KEY = 'terminal.inactivitySeconds';
const DEFAULT_INACTIVITY_SEC = 20;

// Module-level store
class TerminalStore {
  private sessions: Map<string, TerminalSession> = new Map();
  private subscribers: Set<() => void> = new Set();
  private channelsRef: Map<string, Channel<Uint8Array>> = new Map();
  private bytesCbRef: Map<string, (chunk: Uint8Array) => void> = new Map();
  private visibleId: string | null = null;
  private bootstrapped = false;
  private bootstrapping = false;
  private unlistenExit: (() => void) | null = null;
  public inactivityNotifiedRef: Set<string> = new Set();
  public startingSessionIds: Set<string> = new Set();
  public attachingSessionIds: Set<string> = new Set();

  subscribe = (onStoreChange: () => void) => {
    this.subscribers.add(onStoreChange);
    return () => {
      this.subscribers.delete(onStoreChange);
    };
  };

  private cachedSnapshot: any = null;
  private snapshotVersion = 0;

  getSnapshot = () => {
    // Only create a new snapshot if data has changed
    if (!this.cachedSnapshot || this.cachedSnapshot.version !== this.snapshotVersion) {
      this.cachedSnapshot = {
        sessions: this.sessions,
        channelsRef: this.channelsRef,
        bytesCbRef: this.bytesCbRef,
        visibleId: this.visibleId,
        version: this.snapshotVersion
      };
    }
    return this.cachedSnapshot;
  };

  getServerSnapshot = () => {
    return this.getSnapshot();
  };

  private notifySubscribers = () => {
    this.snapshotVersion++;
    this.subscribers.forEach(fn => fn());
  };

  bootstrapOnce = async () => {
    // Atomic check-and-set to prevent concurrent bootstrap
    if (this.bootstrapped || this.bootstrapping) return;
    this.bootstrapping = true;

    // Set up terminal exit listener
    try {
      this.unlistenExit = await safeListen("device-link-event", (event: any) => {
        const data = event.payload;
        if (data?.type === "terminal.exit") {
          const { sessionId, code: exitCode } = data.payload || {};
          if (sessionId) {
            const existing = this.sessions.get(sessionId);
            if (existing) {
              this.sessions.set(sessionId, {
                ...existing,
                status: exitCode === 0 ? "completed" : "failed",
                exitCode
              });
              this.notifySubscribers();

              // Dispatch agent-job-completed event
              window.dispatchEvent(new CustomEvent('agent-job-completed', { detail: { sessionId, code: exitCode } }));

              // Clean up inactivity notification
              this.inactivityNotifiedRef.delete(sessionId);
            }
          }
        }
      });
    } catch (e) {
      console.error("Failed to setup terminal exit listener:", e);
    }

    // Bootstrap sessions on first load
    try {
      // List all sessions already in memory (includes running, restored, and completed)
      const sessionIds = await getActiveTerminalSessions();

      // Fetch actual status for each session instead of defaulting to "running"
      await Promise.all(sessionIds.map(async (sessionId) => {
        try {
          const statusData = await getTerminalStatus(sessionId);
          this.sessions.set(sessionId, {
            sessionId,
            status: (statusData?.status ?? 'stopped') as TerminalStatus,
            exitCode: statusData?.exitCode ?? undefined,
            lastOutput: "[Session loaded]"
          });
        } catch (e) {
          console.error(`Failed to get status for session ${sessionId}:`, e);
          this.sessions.set(sessionId, {
            sessionId,
            status: 'stopped' as TerminalStatus,
            lastOutput: "[Session loaded]"
          });
        }
      }));

      this.notifySubscribers();
    } catch (e) {
      console.error("Failed to bootstrap sessions:", e);
    } finally {
      this.bootstrapping = false;
      this.bootstrapped = true;
    }
  };

  // Store methods exposed to Provider
  setVisibleSessionId = (id: string | null) => {
    this.visibleId = id;
    if (id !== null) {
      const session = this.sessions.get(id);
      if (session) {
        this.sessions.set(id, { ...session, isMinimized: false });
      }
    }
    this.notifySubscribers();
  };

  minimizeSession = (id: string) => {
    const session = this.sessions.get(id);
    if (session) {
      this.sessions.set(id, { ...session, isMinimized: true });
      this.notifySubscribers();
    }
  };

  setOutputBytesCallback = (id: string, cb: (chunk: Uint8Array) => void) => {
    this.bytesCbRef.set(id, cb);
  };

  removeOutputBytesCallback = (id: string) => {
    this.bytesCbRef.delete(id);
  };

  getSession = (id: string) => {
    return this.sessions.get(id);
  };

  updateSession = (id: string, updates: Partial<TerminalSession>) => {
    const existing = this.sessions.get(id);
    if (existing) {
      this.sessions.set(id, { ...existing, ...updates });
    } else {
      this.sessions.set(id, { sessionId: id, status: "starting", ...updates });
    }
    this.notifySubscribers();
  };

  getChannelsRef = () => this.channelsRef;
  getBytesCbRef = () => this.bytesCbRef;

  cleanup = () => {
    if (this.unlistenExit) {
      this.unlistenExit();
      this.unlistenExit = null;
    }
  };
}

// Create singleton store instance
const store = new TerminalStore();

// Bootstrap immediately on module load
store.bootstrapOnce();

const Ctx = createContext<TerminalSessionsContextShape | null>(null);

export const TerminalSessionsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  // Use useSyncExternalStore to read from module store
  const storeState = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot
  );

  const attachSession = useCallback(async (id: string) => {
    // Race condition guard: prevent concurrent attach operations
    if (storeState.channelsRef.has(id) || store.attachingSessionIds.has(id)) return;
    store.attachingSessionIds.add(id);

    try {
      // Pre-flight status check: only attach to running sessions
      try {
        const statusData = await getTerminalStatus(id);
        if (statusData?.status !== 'running') {
          console.log(`Refusing to attach to non-running session ${id} (status: ${statusData?.status})`);
          return;
        }
      } catch (e) {
        console.error(`Failed to check status before attaching to session ${id}:`, e);
        return;
      }

      const ch = new Channel<Uint8Array>();
      ch.onmessage = (chunk) => {
        // Update lastActivityAt on every output chunk
        store.updateSession(id, { lastActivityAt: Date.now() });

        // Clear inactivity notification if it was set
        if (store.inactivityNotifiedRef.has(id)) {
          store.inactivityNotifiedRef.delete(id);
        }

        const cb = store.getBytesCbRef().get(id);
        if (cb) cb(new Uint8Array(chunk));
      };

      try {
        const reconnected = await reconnectTerminalSession(id, ch);
        if (reconnected) {
          storeState.channelsRef.set(id, ch);
          // Refresh status after successful reconnect
          try {
            const refreshedStatus = await getTerminalStatus(id);
            if (refreshedStatus) {
              store.updateSession(id, {
                status: refreshedStatus.status as TerminalStatus,
                exitCode: refreshedStatus.exitCode ?? undefined
              });
            }
          } catch (e) {
            console.error(`Failed to refresh status after reconnect for ${id}:`, e);
          }
          return;
        }
      } catch {}

      await attachTerminalOutput(id, ch);
      storeState.channelsRef.set(id, ch);
    } finally {
      store.attachingSessionIds.delete(id);
    }
  }, [storeState.channelsRef]);

  const startSession = useCallback(async (id: string, opts?: any) => {
    // Race condition guard: prevent concurrent start operations
    if (storeState.channelsRef.has(id) || store.startingSessionIds.has(id)) {
      return;
    }
    store.startingSessionIds.add(id);

    try {
      // Check backend status to determine if we should reconnect or start fresh
      let shouldStartFresh = true;
      try {
        const statusData = await getTerminalStatus(id);
        const isRunning = statusData?.status === 'running';

        if (isRunning && !storeState.channelsRef.has(id)) {
          // Session is running on backend, try to reconnect
          const ch = new Channel<Uint8Array>();
          ch.onmessage = (chunk) => {
            store.updateSession(id, { lastActivityAt: Date.now() });
            if (store.inactivityNotifiedRef.has(id)) {
              store.inactivityNotifiedRef.delete(id);
            }
            const cb = store.getBytesCbRef().get(id);
            if (cb) cb(new Uint8Array(chunk));
          };

          const reconnected = await reconnectTerminalSession(id, ch);
          if (reconnected) {
            storeState.channelsRef.set(id, ch);
            // Refresh status after successful reconnect
            try {
              const refreshedStatus = await getTerminalStatus(id);
              if (refreshedStatus) {
                store.updateSession(id, {
                  status: refreshedStatus.status as TerminalStatus,
                  exitCode: refreshedStatus.exitCode ?? undefined
                });
              }
            } catch (e) {
              console.error(`Failed to refresh status after reconnect for ${id}:`, e);
            }
            shouldStartFresh = false;
          }
        }
      } catch (e) {
        console.error(`Failed to check status for session ${id}:`, e);
      }

      // If session is not running or reconnect failed, start a fresh PTY
      if (!shouldStartFresh) return;

      if (storeState.sessions.has(id) && storeState.channelsRef.has(id)) return;

      const effectiveJobId = opts?.jobId ?? id;
      store.updateSession(id, {
        status: "starting",
        displayName: opts?.displayName,
        origin: opts?.origin,
        jobId: effectiveJobId,
        lastActivityAt: Date.now()
      });

      const ch = new Channel<Uint8Array>();
      ch.onmessage = (chunk) => {
        // Update lastActivityAt on every output chunk
        store.updateSession(id, { lastActivityAt: Date.now() });

        // Clear inactivity notification if it was set
        if (store.inactivityNotifiedRef.has(id)) {
          store.inactivityNotifiedRef.delete(id);
        }

        const cb = store.getBytesCbRef().get(id);
        if (cb) cb(new Uint8Array(chunk));
      };

      await startTerminalSession(id, opts, ch);
      storeState.channelsRef.set(id, ch);

      // Refresh status from backend after starting session
      try {
        const refreshedStatus = await getTerminalStatus(id);
        if (refreshedStatus) {
          store.updateSession(id, {
            status: refreshedStatus.status as TerminalStatus,
            exitCode: refreshedStatus.exitCode ?? undefined,
            lastActivityAt: Date.now()
          });
        } else {
          store.updateSession(id, { status: "running" as TerminalStatus, lastActivityAt: Date.now() });
        }
      } catch (e) {
        console.error(`Failed to refresh status after start for ${id}:`, e);
        store.updateSession(id, { status: "running" as TerminalStatus, lastActivityAt: Date.now() });
      }

      // Dispatch agent-job-started event
      window.dispatchEvent(new CustomEvent('agent-job-started', { detail: { sessionId: id } }));

      // If initialInput is provided, write it to the channel
      if (opts?.initialInput) {
        const encoder = new TextEncoder();
        const data = encoder.encode(opts.initialInput + '\n');
        const channelRef = storeState.channelsRef.get(id);
        if (channelRef) {
          try {
            await writeTerminalInput(id, data);
          } catch (e) {
            console.error("Failed to write initial input:", e);
          }
        }
      }
    } finally {
      store.startingSessionIds.delete(id);
    }
  }, [storeState.sessions, storeState.channelsRef]);

  const detachSession = useCallback((id: string) => {
    storeState.channelsRef.delete(id);
  }, [storeState.channelsRef]);

  const write = useCallback((id: string, data: string | Uint8Array) => {
    void writeTerminalInput(id, data as any);
  }, []);

  const resize = useCallback((id: string, cols: number, rows: number) => {
    void resizeTerminal(id, cols, rows);
  }, []);

  const kill = useCallback((id: string) => {
    void killTerminal(id);
  }, []);

  const cleanupTerminal = useCallback((id: string) => {
    import("@/ui/TerminalView").then(({ cleanupTerminalInstance }) => {
      cleanupTerminalInstance(id);
    }).catch(console.error);
  }, []);

  // Legacy compatibility stubs
  const getActiveCount = useCallback(() => {
    return [...storeState.sessions.values()].filter(s => s.status === "running").length;
  }, [storeState.sessions]);

  const getAttention = useCallback(() => undefined, []);
  const getAttentionCount = useCallback(() => 0, []);
  const deleteLog = useCallback(async () => {}, []);

  // Inactivity scanner
  useEffect(() => {
    const interval = setInterval(() => {
      const threshold = Number(localStorage.getItem(INACTIVITY_KEY)) || DEFAULT_INACTIVITY_SEC;

      storeState.sessions.forEach((session: TerminalSession, id: string) => {
        if (session.status === 'running') {
          const lastTs = session.lastActivityAt ?? Date.now();
          if (Date.now() - lastTs >= threshold * 1000 && !store.inactivityNotifiedRef.has(id)) {
            window.dispatchEvent(new CustomEvent('agent-inactivity', { detail: { sessionId: id } }));
            store.inactivityNotifiedRef.add(id);
          }
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [storeState.sessions]);

  const value = useMemo<TerminalSessionsContextShape>(() => ({
    sessions: storeState.sessions,
    startSession,
    attachSession,
    detachSession,
    write,
    resize,
    kill,
    minimizeSession: store.minimizeSession,
    setVisibleSessionId: store.setVisibleSessionId,
    getVisibleSessionId: () => storeState.visibleId,
    setOutputBytesCallback: store.setOutputBytesCallback,
    removeOutputBytesCallback: store.removeOutputBytesCallback,
    getSession: store.getSession,
    cleanupTerminal,
    getActiveCount,
    getAttention,
    getAttentionCount,
    deleteLog
  }), [storeState, startSession, attachSession, detachSession, write, resize, kill, cleanupTerminal, getActiveCount, getAttention, getAttentionCount, deleteLog]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useTerminalSessions = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTerminalSessions must be used within TerminalSessionsProvider");
  return c;
};
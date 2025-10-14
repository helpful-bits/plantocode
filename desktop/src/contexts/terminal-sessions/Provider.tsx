"use client";
import React, { createContext, useCallback, useContext, useMemo } from "react";
import { Channel } from "@tauri-apps/api/core";
import {
  attachTerminalOutput,
  killTerminal,
  resizeTerminal,
  startTerminalSession,
  writeTerminalInput,
  getActiveTerminalSessions,
  reconnectTerminalSession
} from "@/actions/terminal/terminal.actions";
import { safeListen } from "@/utils/tauri-event-utils";
import type { TerminalSessionsContextShape, TerminalSession } from "./types";

// Module-level store
class TerminalStore {
  private sessions: Map<string, TerminalSession> = new Map();
  private subscribers: Set<() => void> = new Set();
  private channelsRef: Map<string, Channel<Uint8Array>> = new Map();
  private bytesCbRef: Map<string, (chunk: Uint8Array) => void> = new Map();
  private visibleId: string | null = null;
  private bootstrapped = false;
  private unlistenExit: (() => void) | null = null;

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
    if (this.bootstrapped) return;
    this.bootstrapped = true;

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

      // Add all sessions to the store
      // The backend already restored sessions at startup, so we just list what's there
      for (const sessionId of sessionIds) {
        this.sessions.set(sessionId, {
          sessionId,
          status: "running", // Status will be updated via events or status checks
          lastOutput: "[Session loaded]"
        });
      }

      this.notifySubscribers();
    } catch (e) {
      console.error("Failed to bootstrap sessions:", e);
    }
  };

  // Store methods exposed to Provider
  setVisibleSessionId = (id: string | null) => {
    this.visibleId = id;
    this.notifySubscribers();
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
    if (storeState.channelsRef.has(id)) return;

    const ch = new Channel<Uint8Array>();
    ch.onmessage = (chunk) => {
      const cb = store.getBytesCbRef().get(id);
      if (cb) cb(new Uint8Array(chunk));
    };

    try {
      const reconnected = await reconnectTerminalSession(id, ch);
      if (reconnected) {
        storeState.channelsRef.set(id, ch);
        return;
      }
    } catch {}

    await attachTerminalOutput(id, ch);
    storeState.channelsRef.set(id, ch);
  }, [storeState.channelsRef]);

  const startSession = useCallback(async (id: string, opts?: any) => {
    const activeSessions = await getActiveTerminalSessions();
    if (activeSessions.includes(id)) {
      if (!storeState.channelsRef.has(id)) {
        const ch = new Channel<Uint8Array>();
        ch.onmessage = (chunk) => {
          const cb = store.getBytesCbRef().get(id);
          if (cb) cb(new Uint8Array(chunk));
        };
        const reconnected = await reconnectTerminalSession(id, ch);
        if (reconnected) {
          storeState.channelsRef.set(id, ch);
          store.updateSession(id, { status: "running" });
        }
      }
      return;
    }

    if (storeState.sessions.has(id) && storeState.channelsRef.has(id)) return;

    store.updateSession(id, { status: "starting" });

    const ch = new Channel<Uint8Array>();
    ch.onmessage = (chunk) => {
      const cb = store.getBytesCbRef().get(id);
      if (cb) cb(new Uint8Array(chunk));
    };

    await startTerminalSession(id, opts, ch);
    storeState.channelsRef.set(id, ch);
    store.updateSession(id, { status: "running" });
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

  const value = useMemo<TerminalSessionsContextShape>(() => ({
    sessions: storeState.sessions,
    startSession,
    attachSession,
    detachSession,
    write,
    resize,
    kill,
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
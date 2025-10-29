import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { type HistoryState } from "@/actions/session/history.actions";

/**
 * Event Bridge for Session Events
 *
 * All event payloads are guaranteed to be in camelCase format by explicit
 * Rust payload structs with #[serde(rename_all = "camelCase")] in:
 * desktop/src-tauri/src/events/session_events.rs
 */

type DeviceLinkEvent = {
  type: string;
  payload: any;
  relayOrigin?: "remote" | "local" | string;
};

interface HistoryStateChangedEvent {
  sessionId: string;
  kind: 'task' | 'files';
  state: HistoryState;
  version: number;
  checksum: string;
}

type Handlers = {
  onActiveSessionChanged?: (sessionId: string, projectDirectory: string) => void;
  onRemoteSessionCreated?: (session: { id: string; projectDirectory: string }) => void;
  onSessionListInvalidate?: (projectDirectory: string) => void;
  onSessionUpdated?: (session: any) => void;
  onSessionDeleted?: (sessionId: string) => void;
  onSessionCreated?: (session: any) => void;
};

let initialized = false;
let unlistenDeviceLink: UnlistenFn | null = null;
let unlistenSessionUpdated: UnlistenFn | null = null;
let unlistenSessionDeleted: UnlistenFn | null = null;
const handlers = new Set<Handlers>();
const lastAppliedSwitch = { sessionId: null as null | string };
const historyStateChangedCallbacks = new Map<string, Set<(event: HistoryStateChangedEvent) => void>>();

export async function initSessionEventBridge() {
  if (initialized) return;
  initialized = true;

  unlistenDeviceLink = await listen("device-link-event", (event) => {
    const data = event.payload as DeviceLinkEvent;
    if (!data || typeof data !== "object") return;

    if (data.type === "active-session-changed") {
      const { sessionId, projectDirectory } = data.payload || {};
      if (sessionId && projectDirectory) {
        if (lastAppliedSwitch.sessionId !== sessionId) {
          lastAppliedSwitch.sessionId = sessionId;
          handlers.forEach(h => h.onActiveSessionChanged?.(sessionId, projectDirectory));
        }
      }
      return;
    }

    if (data.type === "session-created" && data.relayOrigin === "remote") {
      const session = data.payload?.session;
      if (session?.id && session?.projectDirectory) {
        if (lastAppliedSwitch.sessionId !== session.id) {
          handlers.forEach(h => h.onRemoteSessionCreated?.(session));
        }
        handlers.forEach(h => h.onSessionCreated?.(session));
        handlers.forEach(h => h.onSessionListInvalidate?.(session.projectDirectory));
      }
      return;
    }

    if (data.type === "session-deleted" && data.relayOrigin === "remote") {
      const session = data.payload?.session;
      if (session?.projectDirectory) {
        handlers.forEach(h => h.onSessionListInvalidate?.(session.projectDirectory));
      }
      return;
    }

    if (data.type === 'history-state-changed') {
      const detail = data.payload || data;

      // Transform file history state: parse JSON strings to arrays
      let transformedState = detail.state;
      if (detail.kind === 'files' && detail.state?.entries) {
        transformedState = {
          ...detail.state,
          entries: detail.state.entries.map((e: any) => ({
            ...e,
            includedFiles: typeof e.includedFiles === 'string' ? JSON.parse(e.includedFiles) : e.includedFiles,
            forceExcludedFiles: typeof e.forceExcludedFiles === 'string' ? JSON.parse(e.forceExcludedFiles) : e.forceExcludedFiles,
          })),
        };
      }

      const transformedDetail = {
        sessionId: detail.sessionId,
        kind: detail.kind,
        state: transformedState,
        version: detail.version,
        checksum: detail.checksum,
        relayOrigin: data.relayOrigin || 'local',
      };

      window.dispatchEvent(
        new CustomEvent('history-state-changed', {
          detail: transformedDetail,
        })
      );

      if (historyStateChangedCallbacks.has(detail.sessionId)) {
        const callbacks = historyStateChangedCallbacks.get(detail.sessionId);
        callbacks?.forEach(callback => {
          try {
            callback(transformedDetail);
          } catch (err) {
            console.error('History state changed callback error:', err);
          }
        });
      }
      return;
    }
  });

  unlistenSessionUpdated = await listen("session-updated", (event) => {
    const payload = event.payload as { sessionId: string; session: any };

    // Dev-only warning: detect snake_case keys (should never happen)
    if (process.env.NODE_ENV === "development") {
      const payloadObj = payload as any;
      if ("session_id" in payloadObj || "project_directory" in payloadObj) {
        console.error("[event-bridge] CRITICAL: Detected snake_case keys in session-updated payload. Expected camelCase only.", payloadObj);
      }
    }

    handlers.forEach(h => h.onSessionUpdated?.(payload.session));
    handlers.forEach(h => h.onSessionListInvalidate?.(payload.session.projectDirectory));
  });

  unlistenSessionDeleted = await listen("session-deleted", (event) => {
    const payload = event.payload as { sessionId: string };

    // Dev-only warning: detect snake_case keys (should never happen)
    if (process.env.NODE_ENV === "development") {
      const payloadObj = payload as any;
      if ("session_id" in payloadObj) {
        console.error("[event-bridge] CRITICAL: Detected snake_case keys in session-deleted payload. Expected camelCase only.", payloadObj);
      }
    }

    handlers.forEach(h => h.onSessionDeleted?.(payload.sessionId));
  });
}

export function registerSessionEventHandlers(h: Handlers) {
  handlers.add(h);
  return () => {
    handlers.delete(h);
  };
}

export function onHistoryStateChanged(
  sessionId: string,
  callback: (event: HistoryStateChangedEvent) => void
): () => void {
  if (!historyStateChangedCallbacks.has(sessionId)) {
    historyStateChangedCallbacks.set(sessionId, new Set());
  }

  const callbacks = historyStateChangedCallbacks.get(sessionId)!;
  callbacks.add(callback);

  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      historyStateChangedCallbacks.delete(sessionId);
    }
  };
}

export async function disposeSessionEventBridge() {
  if (unlistenDeviceLink) {
    await unlistenDeviceLink();
    unlistenDeviceLink = null;
  }
  if (unlistenSessionUpdated) {
    await unlistenSessionUpdated();
    unlistenSessionUpdated = null;
  }
  if (unlistenSessionDeleted) {
    await unlistenSessionDeleted();
    unlistenSessionDeleted = null;
  }
  handlers.clear();
  historyStateChangedCallbacks.clear();
  initialized = false;
}

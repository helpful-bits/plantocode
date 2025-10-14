import { listen, UnlistenFn } from "@tauri-apps/api/event";

type DeviceLinkEvent = {
  type: string;
  payload: any;
  relayOrigin?: "remote" | "local" | string;
};

type Handlers = {
  onActiveSessionChanged?: (sessionId: string, projectDirectory: string) => void;
  onRemoteSessionCreated?: (session: { id: string; projectDirectory: string }) => void;
  onSessionListInvalidate?: (projectDirectory: string) => void;
};

let initialized = false;
let unlisten: UnlistenFn | null = null;
const handlers = new Set<Handlers>();
const lastAppliedSwitch = { sessionId: null as null | string };

export async function initSessionEventBridge() {
  if (initialized) return;
  initialized = true;
  unlisten = await listen("device-link-event", (event) => {
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
  });
}

export function registerSessionEventHandlers(h: Handlers) {
  handlers.add(h);
  return () => {
    handlers.delete(h);
  };
}

export async function disposeSessionEventBridge() {
  if (unlisten) {
    await unlisten();
    unlisten = null;
  }
  handlers.clear();
  initialized = false;
}

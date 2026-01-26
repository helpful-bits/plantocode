import { EventName, EventCallback, UnlistenFn, listen } from '@tauri-apps/api/event';

// Tauri window event constants
export const TAURI_EVT_MINIMIZE = 'tauri://minimize';
export const TAURI_EVT_RESTORE = 'tauri://restore';
export const TAURI_EVT_FOCUS = 'tauri://focus';
export const TAURI_EVT_RESIZED = 'tauri://resized';

function isTauriEventApiAvailable(): boolean {
  return true;
}

const safeNoopUnlisten: UnlistenFn = () => {};
const EVENT_NAME_PATTERN = /^[A-Za-z0-9:/_-]+$/;

export async function safeListen<T>(
  event: EventName,
  handler: EventCallback<T>
): Promise<UnlistenFn> {
  if (!isTauriEventApiAvailable()) {
    return Promise.resolve(safeNoopUnlisten);
  }

  if (typeof event === "string" && !EVENT_NAME_PATTERN.test(event)) {
    console.warn(`[safeListen] Invalid event name "${event}". Skipping listener registration.`);
    return Promise.resolve(safeNoopUnlisten);
  }

  return listen(event, handler);
}

export interface WindowLifecycleCallbacks {
  onMinimize?: () => void;
  onRestore?: () => void;
  onFocus?: () => void;
  onResized?: (payload: any) => void;
}

export async function subscribeWindowLifecycle(callbacks: WindowLifecycleCallbacks): Promise<UnlistenFn[]> {
  const unlisteners: UnlistenFn[] = [];

  if (callbacks.onMinimize) {
    const unlisten = await safeListen(TAURI_EVT_MINIMIZE, callbacks.onMinimize);
    unlisteners.push(unlisten);
  }

  if (callbacks.onRestore) {
    const unlisten = await safeListen(TAURI_EVT_RESTORE, callbacks.onRestore);
    unlisteners.push(unlisten);
  }

  if (callbacks.onFocus) {
    const unlisten = await safeListen(TAURI_EVT_FOCUS, callbacks.onFocus);
    unlisteners.push(unlisten);
  }

  if (callbacks.onResized) {
    const unlisten = await safeListen(TAURI_EVT_RESIZED, callbacks.onResized);
    unlisteners.push(unlisten);
  }

  return unlisteners;
}

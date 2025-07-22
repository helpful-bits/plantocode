import { EventName, EventCallback, UnlistenFn, listen } from '@tauri-apps/api/event';

function isTauriEventApiAvailable(): boolean {
  return true;
}

const safeNoopUnlisten: UnlistenFn = () => {};

export async function safeListen<T>(
  event: EventName,
  handler: EventCallback<T>
): Promise<UnlistenFn> {
  if (!isTauriEventApiAvailable()) {
    return Promise.resolve(safeNoopUnlisten);
  }
  
  return listen(event, handler);
}
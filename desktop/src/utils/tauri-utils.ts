/**
 * Tauri utility functions for environment checks and safe operations
 */

/**
 * Check if Tauri context is available
 * Used to prevent errors when cleanup functions are called after Tauri context is destroyed
 */
export function isTauriAvailable(): boolean {
  return typeof window !== 'undefined' && 
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ !== undefined;
}

/**
 * Safely cleanup a Tauri event listener
 * Handles errors gracefully when Tauri context is no longer available
 */
export function safeCleanupListener(cleanupFn: () => void): void {
  try {
    cleanupFn();
  } catch (error) {
    // Silently handle cleanup errors when Tauri context is gone
    console.debug('Event listener cleanup failed (likely due to Tauri context being destroyed):', error);
  }
}

/**
 * Safely cleanup a Tauri event listener promise
 * Handles both promise rejection and cleanup function errors
 */
export function safeCleanupListenerPromise(unlistenPromise: Promise<() => void>): void {
  void unlistenPromise.then((cleanupFn) => {
    safeCleanupListener(cleanupFn);
  }).catch(() => {
    // Ignore cleanup promise rejection
  });
}
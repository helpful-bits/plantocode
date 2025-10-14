"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import { logError } from "@/utils/error-handling";
import { safeListen } from "@/utils/tauri-event-utils";

// Define the type for our context
export interface UILayoutContextType {
  // Sidebar state
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (collapsed: boolean) => void;

  // Global loading/busy indicator state
  isAppBusy: boolean;
  setAppBusy: (busy: boolean) => void;

  // App initialization state - controls whether the app shows initial loading screen
  isAppInitializing: boolean;
  setAppInitializing: (initializing: boolean) => void;

  // Optional message to display with the loading indicator
  busyMessage: string | null;
  setBusyMessage: (message: string | null) => void;

  // Window presence tracking
  windowFocused: boolean;
  windowVisible: boolean;
  windowMinimized: boolean;
  isUserPresent: boolean;
  lastPresenceChangeTs: number;
}

// Create the context with a default value of undefined
const UILayoutContext = createContext<UILayoutContextType | undefined>(
  undefined
);

// Provider component that will wrap the app layout
export function UILayoutProvider({ children }: { children: ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isAppBusy, setIsAppBusy] = useState<boolean>(false);
  const [isAppInitializing, setIsAppInitializing] = useState<boolean>(true);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [windowFocused, setWindowFocused] = useState<boolean>(false);
  const [windowVisible, setWindowVisible] = useState<boolean>(true);
  const [windowMinimized, setWindowMinimized] = useState<boolean>(false);
  const [lastPresenceChangeTs, setLastPresenceChangeTs] = useState<number>(Date.now());

  const isUserPresent = useMemo(() => windowFocused && windowVisible && !windowMinimized, [windowFocused, windowVisible, windowMinimized]);

  useEffect(() => {
    setLastPresenceChangeTs(Date.now());
  }, [isUserPresent]);

  useEffect(() => {
    let unlisteners: (() => void)[] = [];

    const initializePresenceTracking = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        const [focused, visible, minimized] = await Promise.all([
          win.isFocused(),
          win.isVisible(),
          win.isMinimized()
        ]);

        setWindowFocused(focused);
        setWindowVisible(visible);
        setWindowMinimized(minimized);

        const unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
          setWindowFocused(focused);
          if (focused) {
            win.isVisible().then(setWindowVisible).catch(() => {});
          }
        });
        unlisteners.push(unlistenFocus);

        const unlistenMinimize = await safeListen('tauri://minimize', () => {
          setWindowMinimized(true);
          setWindowVisible(false);
        });
        unlisteners.push(unlistenMinimize);

        const unlistenRestore = await safeListen('tauri://restore', async () => {
          try {
            const [vis, min] = await Promise.all([
              win.isVisible(),
              win.isMinimized()
            ]);
            setWindowVisible(vis);
            setWindowMinimized(min);
          } catch {}
        });
        unlisteners.push(unlistenRestore);

        const handleVisibilityChange = () => {
          setWindowVisible(document.visibilityState === 'visible');
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        unlisteners.push(() => document.removeEventListener('visibilitychange', handleVisibilityChange));
      } catch (error) {
        logError(error as Error, "Failed to initialize presence tracking").catch(() => {});
      }
    };

    initializePresenceTracking();

    return () => {
      unlisteners.forEach(unlisten => unlisten());
    };
  }, []);

  const setAppBusy = useCallback((busy: boolean) => {
    setIsAppBusy(busy);
    if (!busy) {
      setBusyMessage(null);
    }
  }, []);

  const setAppInitializing = useCallback((initializing: boolean) => {
    setIsAppInitializing(initializing);
  }, []);

  const value: UILayoutContextType = useMemo(
    () => ({
      isSidebarCollapsed,
      setIsSidebarCollapsed,
      isAppBusy,
      setAppBusy,
      isAppInitializing,
      setAppInitializing,
      busyMessage,
      setBusyMessage,
      windowFocused,
      windowVisible,
      windowMinimized,
      isUserPresent,
      lastPresenceChangeTs,
    }),
    [
      isSidebarCollapsed,
      setIsSidebarCollapsed,
      isAppBusy,
      setAppBusy,
      isAppInitializing,
      setAppInitializing,
      busyMessage,
      setBusyMessage,
      windowFocused,
      windowVisible,
      windowMinimized,
      isUserPresent,
      lastPresenceChangeTs,
    ]
  );

  return (
    <UILayoutContext.Provider value={value}>
      {children}
    </UILayoutContext.Provider>
  );
}

// Custom hook to use the UI layout context
export function useUILayout(): UILayoutContextType {
  const context = useContext(UILayoutContext);

  if (context === undefined) {
    const error = new Error("useUILayout must be used within a UILayoutProvider");
    logError(error, "UI Layout Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }

  return context;
}

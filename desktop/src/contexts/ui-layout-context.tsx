"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { logError } from "@/utils/error-handling";

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
}

// Create the context with a default value of undefined
const UILayoutContext = createContext<UILayoutContextType | undefined>(
  undefined
);

// Provider component that will wrap the app layout
export function UILayoutProvider({ children }: { children: ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isAppBusy, setIsAppBusy] = useState<boolean>(false);
  const [isAppInitializing, setIsAppInitializing] = useState<boolean>(true); // Start with true to show initialization screen by default
  const [busyMessage, setBusyMessage] = useState<string | null>(null);

  // Wrapped setter for busy state to allow easier parameter passing
  const setAppBusy = useCallback((busy: boolean) => {
    setIsAppBusy(busy);
    // Auto-clear the message when no longer busy
    if (!busy) {
      setBusyMessage(null);
    }
  }, []);

  // Enhanced setter for app initializing state with logging
  const setAppInitializing = useCallback((initializing: boolean) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[UILayout] App initializing state changed: ${initializing}`);
    }
    setIsAppInitializing(initializing);
  }, []);

  // Create the value object that will be passed to consumers
  const value: UILayoutContextType = useMemo(
    () => ({
      // Sidebar state
      isSidebarCollapsed,
      setIsSidebarCollapsed,

      // Global loading indicator state
      isAppBusy,
      setAppBusy,

      // App initialization state
      isAppInitializing,
      setAppInitializing,

      // Busy message
      busyMessage,
      setBusyMessage,
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

"use client";

import { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { logError } from "@/utils/error-handling";

/**
 * Raw status strings emitted by the Rust device_link subsystem
 */
export type DeviceLinkStatusRaw =
  | "idle"
  | "registered"
  | "resumed"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error"
  | "auth_failed"
  | "disabled"
  | "unknown";

/**
 * High-level connection state for UI
 */
export type DeviceLinkConnectionState = "connected" | "disconnected" | "error";

/**
 * Payload from device-link-status Tauri event
 */
interface DeviceLinkStatusPayload {
  status: DeviceLinkStatusRaw | string;
  backoff_ms?: number;
  attempt?: number;
  message?: string;
}

/**
 * Context value exposed to consumers
 */
export interface DeviceLinkContextValue {
  rawStatus: DeviceLinkStatusRaw;
  connectionState: DeviceLinkConnectionState;
  lastStatusChangeAt: Date | null;
  lastErrorMessage: string | null;
  backoffMs: number | null;
  attempt: number | null;
  isInitialized: boolean;
  isConnected: boolean;
  isInError: boolean;
  isReconnecting: boolean;
  isDisabled: boolean;
}

const DeviceLinkContext = createContext<DeviceLinkContextValue | undefined>(undefined);

/**
 * Normalize status string into known DeviceLinkStatusRaw
 */
function normalizeStatus(raw: string): DeviceLinkStatusRaw {
  const lower = raw.toLowerCase().trim();
  switch (lower) {
    case "idle":
      return "idle";
    case "registered":
      return "registered";
    case "resumed":
      return "resumed";
    case "connected":
      return "connected";
    case "disconnected":
      return "disconnected";
    case "reconnecting":
      return "reconnecting";
    case "error":
      return "error";
    case "auth_failed":
    case "authfailed":
      return "auth_failed";
    case "disabled":
      return "disabled";
    default:
      return "unknown";
  }
}

/**
 * Derive connection state from raw status (mirrors tray mapping)
 */
function deriveConnectionState(rawStatus: DeviceLinkStatusRaw): DeviceLinkConnectionState {
  switch (rawStatus) {
    case "registered":
    case "resumed":
    case "connected":
      return "connected";
    case "auth_failed":
    case "error":
      return "error";
    default:
      return "disconnected";
  }
}

export function DeviceLinkProvider({ children }: { children: React.ReactNode }) {
  const [rawStatus, setRawStatus] = useState<DeviceLinkStatusRaw>("idle");
  const [lastStatusChangeAt, setLastStatusChangeAt] = useState<Date | null>(null);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [backoffMs, setBackoffMs] = useState<number | null>(null);
  const [attempt, setAttempt] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const prevStatusRef = useRef<DeviceLinkStatusRaw>("idle");

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlistenFn = await listen<DeviceLinkStatusPayload | string>(
          "device-link-status",
          (event) => {
            try {
              let payload: DeviceLinkStatusPayload;

              // Parse payload (handles both string and object formats)
              if (typeof event.payload === "string") {
                try {
                  payload = JSON.parse(event.payload);
                } catch {
                  // If not JSON, treat as raw status string
                  payload = { status: event.payload };
                }
              } else {
                payload = event.payload;
              }

              const normalized = normalizeStatus(payload.status);

              // Update state only if status changed
              if (normalized !== prevStatusRef.current) {
                setRawStatus(normalized);
                setLastStatusChangeAt(new Date());
                prevStatusRef.current = normalized;
              }

              // Update error message if present
              if (payload.message) {
                setLastErrorMessage(payload.message);
              } else if (normalized === "error" || normalized === "auth_failed") {
                // Keep previous error message for error states
              } else {
                // Clear error message for non-error states
                setLastErrorMessage(null);
              }

              // Update backoff and attempt
              setBackoffMs(payload.backoff_ms ?? null);
              setAttempt(payload.attempt ?? null);

              // Mark as initialized after first event
              if (!isInitialized) {
                setIsInitialized(true);
              }
            } catch (err) {
              logError(err, "DeviceLinkContext: Failed to process event payload").catch(
                () => {}
              );
            }
          }
        );

        // Mark as initialized even if no events come yet
        setIsInitialized(true);
      } catch (err) {
        logError(err, "DeviceLinkContext: Failed to setup listener").catch(() => {});
        setIsInitialized(true); // Still mark initialized to avoid blocking UI
      }
    };

    void setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [isInitialized]);

  const connectionState = useMemo(
    () => deriveConnectionState(rawStatus),
    [rawStatus]
  );

  const isConnected = connectionState === "connected";
  const isInError = connectionState === "error";
  const isReconnecting = rawStatus === "reconnecting";
  const isDisabled = rawStatus === "disabled";

  const value: DeviceLinkContextValue = {
    rawStatus,
    connectionState,
    lastStatusChangeAt,
    lastErrorMessage,
    backoffMs,
    attempt,
    isInitialized,
    isConnected,
    isInError,
    isReconnecting,
    isDisabled,
  };

  return (
    <DeviceLinkContext.Provider value={value}>
      {children}
    </DeviceLinkContext.Provider>
  );
}

export function useDeviceLink(): DeviceLinkContextValue {
  const context = useContext(DeviceLinkContext);
  if (!context) {
    throw new Error("useDeviceLink must be used within DeviceLinkProvider");
  }
  return context;
}

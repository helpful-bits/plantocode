/**
 * Desktop Environment Provider
 *
 * This provider sets up the desktop environment by setting global flags
 * and handling deep link events.
 */

import { type ReactNode, useEffect } from "react";

import { useDeepLinkHandler } from "@/hooks/use-deep-link-handler";
import { createLogger } from "@/utils/logger";
import { isTauriEnvironment } from "@/utils/platform";

const logger = createLogger({ namespace: "DesktopEnvironment" });

// Type for the desktop bridge global
interface DesktopAppBridge {
  isDesktopApp: boolean;
}

type WindowWithDesktopBridge = Window & {
  __DESKTOP_APP_BRIDGE__?: DesktopAppBridge;
}

// Provider component
export function DesktopEnvironmentProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Use the dedicated deep link handler hook
  useDeepLinkHandler();

  useEffect(() => {
    // Inject a global marker that this is the desktop app
    if (typeof window !== "undefined") {
      const typedWindow = window as WindowWithDesktopBridge;
      typedWindow.__DESKTOP_APP_BRIDGE__ = 
        typedWindow.__DESKTOP_APP_BRIDGE__ || { isDesktopApp: true };
      
      // Ensure the isDesktopApp property is set
      if (typedWindow.__DESKTOP_APP_BRIDGE__) {
        typedWindow.__DESKTOP_APP_BRIDGE__.isDesktopApp = true;
      }
    }

    // Verify that we're running in Tauri environment
    if (!isTauriEnvironment()) {
      logger.warn("Not running in Tauri environment. Some features may not work.");
    }
  }, []); // Only run once on mount

  return <>{children}</>;
}

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

// Provider component
export function DesktopEnvironmentProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Use the dedicated deep link handler hook
  useDeepLinkHandler();

  useEffect(() => {
    // Verify that we're running in Tauri environment
    if (!isTauriEnvironment()) {
      logger.warn("Not running in Tauri environment. Some features may not work.");
    }
  }, []); // Only run once on mount

  return <>{children}</>;
}

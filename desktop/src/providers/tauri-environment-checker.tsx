import { type ReactNode, useEffect } from "react";
import { createLogger } from "@/utils/logger";
import { isTauriEnvironment } from "@/utils/platform";

const logger = createLogger({ namespace: "DesktopEnvironment" });

export function TauriEnvironmentChecker({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    if (!isTauriEnvironment()) {
      logger.warn("Not running in Tauri environment. Some features may not work.");
    }
  }, []);

  return <>{children}</>;
}

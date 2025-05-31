"use client";

import { createLogger } from "@/utils/logger";
import { type FilesMap } from "../_hooks/file-management/use-project-file-list";

const logger = createLogger({ namespace: "file-selection-debug" });

/**
 * Logs changes to file selections for debugging
 */
export const trackSelectionChanges = (
  prevMapString: string,
  newMap: FilesMap,
  action: string
): void => {
  try {
    logger.debug(`File selection changed - Action: ${action}`, {
      prevMapString,
      newMapSize: Object.keys(newMap).length,
      newMapKeys: Object.keys(newMap)
    });
  } catch (error) {
    logger.error("Error in trackSelectionChanges:", error);
  }
};
"use client";

import { FilesMap } from "../_hooks/use-file-selection-state";

/**
 * Logs changes to file selections for debugging
 */
export const trackSelectionChanges = (
  prevMapString: string,
  newMap: FilesMap,
  action: string
): void => {
  try {
    console.log(`[Debug] File selection changes via ${action}:`, {
      prevMap: prevMapString.substring(0, 100) + "...", // Log just a snippet of the stringified map
      newMap: Object.keys(newMap).length + " files",
      action
    });
  } catch (error) {
    console.error("[Debug] Error in trackSelectionChanges:", error);
  }
}; 
"use client";

import { FilesMap } from "../_hooks/use-file-selection-state";

/**
 * Logs changes to a file's selection state for debugging
 */
export const trackSelectionChanges = (
  path: string,
  included: boolean,
  forceExcluded: boolean
): void => {
  console.log(`[Debug] File selection change for ${path}: included=${included}, forceExcluded=${forceExcluded}`);
}; 
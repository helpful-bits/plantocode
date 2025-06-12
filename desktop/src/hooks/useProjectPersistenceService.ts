/**
 * Project Persistence Service Hook
 *
 * Simple service for loading and saving project directory information.
 */

import { useCallback } from "react";

import {
  getGenericCachedStateAction,
  saveGenericCachedStateAction,
} from "@/actions/project-settings";
import { GLOBAL_PROJECT_DIR_KEY } from "@/utils/constants";
import { normalizePath } from "@/utils/path-utils";

/**
 * Hook that provides simple project directory persistence operations
 */
export function useProjectPersistenceService() {
  /**
   * Load the project directory from persistent storage
   */
  const loadProjectDirectory = useCallback(async (): Promise<string | null> => {
    try {
      const result = await getGenericCachedStateAction(null, GLOBAL_PROJECT_DIR_KEY);
      
      if (!result.isSuccess || !result.data) {
        return null;
      }

      const cachedDir = result.data as string;
      return await normalizePath(cachedDir);
    } catch (error) {
      console.error("Error loading project directory:", error);
      return null;
    }
  }, []);

  /**
   * Save project directory to persistent storage
   */
  const saveProjectDirectory = useCallback(async (dir: string): Promise<void> => {
    if (!dir?.trim()) {
      throw new Error("Cannot save empty project directory");
    }

    try {
      const normalizedDir = await normalizePath(dir);
      const result = await saveGenericCachedStateAction(null, GLOBAL_PROJECT_DIR_KEY, normalizedDir);
      
      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to save project directory");
      }
    } catch (error) {
      console.error("Error saving project directory:", error);
      throw error;
    }
  }, []);

  return {
    loadProjectDirectory,
    saveProjectDirectory,
  };
}

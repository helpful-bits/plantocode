/**
 * Project Persistence Service Hook
 *
 * Provides functionality for loading and saving project directory information
 * while abstracting away the underlying persistence mechanism.
 */

import { useCallback } from "react";

import {
  getGenericCachedStateAction,
  saveGenericCachedStateAction,
} from "@/actions/project-settings";
import { GLOBAL_PROJECT_DIR_KEY } from "@/utils/constants";
import { createLogger } from "@/utils/logger";
import { normalizePath } from "@/utils/path-utils";

const logger = createLogger({ namespace: "ProjectPersistenceService" });

/**
 * Hook that encapsulates project directory persistence operations
 */
export function useProjectPersistenceService() {
  /**
   * Load the project directory from persistent storage
   * @returns The normalized project directory or null if not found/error
   */
  const loadProjectDirectory = useCallback(async (): Promise<string | null> => {
    try {
      logger.log("Loading project directory");

      // Load from persistent storage via server action
      const cachedResult = await getGenericCachedStateAction(
        null,
        GLOBAL_PROJECT_DIR_KEY
      );

      if (!cachedResult.isSuccess) {
        logger.error("Error loading project directory:", cachedResult.message);
        return null;
      }

      const cachedDir =
        typeof cachedResult.data === "string" ? cachedResult.data : null;

      if (!cachedDir) {
        logger.log("No cached project directory found");
        return null;
      }

      try {
        // Normalize the path before returning
        const normalizedDir = await normalizePath(cachedDir);
        logger.log(`Found cached project directory: ${normalizedDir}`);
        return normalizedDir;
      } catch (pathErr) {
        logger.error(`Error normalizing path:`, pathErr);
        return null;
      }
    } catch (err) {
      logger.error("Error loading project directory:", err);
      return null;
    }
  }, []);

  /**
   * Save project directory to persistent storage
   * @param dir The directory to save
   * @returns Success status and message
   */
  const saveProjectDirectory = useCallback(async (dir: string) => {
    if (!dir) {
      logger.warn("Attempted to save empty project directory");
      return {
        success: false,
        message: "Cannot save empty project directory",
      };
    }

    try {
      // Normalize the path before saving
      const normalizedDir = await normalizePath(dir);
      logger.log(`Saving project directory: ${normalizedDir}`);

      // Save to persistent storage via server action
      const result = await saveGenericCachedStateAction(
        null,
        GLOBAL_PROJECT_DIR_KEY,
        normalizedDir
      );

      if (!result.isSuccess) {
        logger.error(`Error saving project directory:`, result.message);
        return {
          success: false,
          message: result.message || "Unknown error saving project directory",
        };
      }

      return {
        success: true,
        message: "Project directory saved successfully",
      };
    } catch (err) {
      logger.error("Error saving project directory:", err);
      return {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "Unknown error saving project directory",
      };
    }
  }, []);

  return {
    loadProjectDirectory,
    saveProjectDirectory,
  };
}

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
import { AppError, ErrorType } from "@/utils/error-handling";
import { createLogger } from "@/utils/logger";
import { normalizePath } from "@/utils/path-utils";

const logger = createLogger({ namespace: "ProjectPersistenceService" });

/**
 * Hook that encapsulates project directory persistence operations
 */
export function useProjectPersistenceService() {
  /**
   * Load the project directory from persistent storage
   * @returns The normalized project directory or null if not found
   * @throws {AppError} When there's an error loading or normalizing the path
   */
  const loadProjectDirectory = useCallback(async (): Promise<string | null> => {
    try {
      logger.info("Loading project directory");

      // Load from persistent storage via server action
      const cachedResult = await getGenericCachedStateAction(
        null,
        GLOBAL_PROJECT_DIR_KEY
      );

      if (!cachedResult.isSuccess) {
        logger.error("Error loading project directory:", cachedResult.message);
        throw new AppError(
          cachedResult.message || "Failed to load project directory from cache",
          ErrorType.DATABASE_ERROR
        );
      }

      const cachedDir =
        typeof cachedResult.data === "string" ? cachedResult.data : null;

      if (!cachedDir) {
        logger.info("No cached project directory found");
        return null;
      }

      try {
        // Normalize the path before returning
        const normalizedDir = await normalizePath(cachedDir);
        logger.info(`Found cached project directory: ${normalizedDir}`);
        return normalizedDir;
      } catch (pathErr) {
        logger.error(`Error normalizing path:`, pathErr);
        throw new AppError(
          `Failed to normalize cached path: ${pathErr instanceof Error ? pathErr.message : String(pathErr)}`,
          ErrorType.VALIDATION_ERROR,
          { cause: pathErr instanceof Error ? pathErr : undefined }
        );
      }
    } catch (err) {
      // Re-throw AppError instances as-is
      if (err instanceof AppError) {
        throw err;
      }
      
      logger.error("Error loading project directory:", err);
      throw new AppError(
        `Unexpected error loading project directory: ${err instanceof Error ? err.message : String(err)}`,
        ErrorType.INTERNAL_ERROR,
        { cause: err instanceof Error ? err : undefined }
      );
    }
  }, []);

  /**
   * Save project directory to persistent storage
   * @param dir The directory to save
   * @throws {AppError} When there's an error saving or normalizing the path
   */
  const saveProjectDirectory = useCallback(async (dir: string): Promise<void> => {
    if (!dir) {
      logger.warn("Attempted to save empty project directory");
      throw new AppError(
        "Cannot save empty project directory",
        ErrorType.VALIDATION_ERROR
      );
    }

    try {
      // Normalize the path before saving
      const normalizedDir = await normalizePath(dir);
      logger.info(`Saving project directory: ${normalizedDir}`);

      // Save to persistent storage via server action
      const result = await saveGenericCachedStateAction(
        null,
        GLOBAL_PROJECT_DIR_KEY,
        normalizedDir
      );

      if (!result.isSuccess) {
        logger.error(`Error saving project directory:`, result.message);
        throw new AppError(
          result.message || "Failed to save project directory to cache",
          ErrorType.DATABASE_ERROR
        );
      }

      logger.info("Project directory saved successfully");
    } catch (err) {
      // Re-throw AppError instances as-is
      if (err instanceof AppError) {
        throw err;
      }

      // Handle normalizePath errors specifically
      if (err instanceof Error && err.message.includes("normalize")) {
        logger.error("Error normalizing path for save:", err);
        throw new AppError(
          `Failed to normalize path for saving: ${err.message}`,
          ErrorType.VALIDATION_ERROR,
          { cause: err }
        );
      }

      logger.error("Error saving project directory:", err);
      throw new AppError(
        `Unexpected error saving project directory: ${err instanceof Error ? err.message : String(err)}`,
        ErrorType.INTERNAL_ERROR,
        { cause: err instanceof Error ? err : undefined }
      );
    }
  }, []);

  return {
    loadProjectDirectory,
    saveProjectDirectory,
  };
}

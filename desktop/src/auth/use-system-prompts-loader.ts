import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "SystemPromptsLoader" });

// Global state to prevent concurrent system prompts loads
let isSystemPromptsLoading = false;

export interface SystemPromptsLoaderResult {
  isLoading: boolean;
  error: string | null;
  loadSystemPrompts: () => Promise<boolean>;
  clearError: () => void;
}

/**
 * Hook for loading system prompts after authentication
 * Follows the same pattern as the runtime config loader
 */
export function useSystemPromptsLoader(): SystemPromptsLoaderResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSystemPrompts = useCallback(async (): Promise<boolean> => {
    if (isLoading || isSystemPromptsLoading) return false;

    try {
      isSystemPromptsLoading = true;
      setIsLoading(true);
      setError(null);

      // Get the token from Rust's secure storage
      const token = await invoke<string | null>('get_app_jwt');
      
      if (!token) {
        logger.error("Cannot load system prompts without a valid token");
        setError("Authentication token not available.");
        return false;
      }

      logger.info("Initializing system prompts from server...");

      // Initialize system prompts from server - this populates the local cache
      await invoke("initialize_system_prompts_from_server");

      logger.info("System prompts initialized successfully");
      return true;
    } catch (err) {
      logger.error("Failed to load system prompts:", err);
      const errorMessage =
        err instanceof Error
          ? `System Prompts Error: ${err.message}`
          : "Failed to load system prompts. Please try again.";

      setError(errorMessage);
      return false;
    } finally {
      isSystemPromptsLoading = false;
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    if (error) setError(null);
  }, [error]);

  return {
    isLoading,
    error,
    loadSystemPrompts,
    clearError,
  };
}
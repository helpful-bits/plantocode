import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  loadRuntimeConfigAfterLogin,
  type RuntimeAIConfig,
  useRuntimeConfig,
} from "../contexts/runtime-config-context";

export interface RuntimeConfigLoaderResult {
  isLoading: boolean;
  error: string | null;
  loadConfig: () => Promise<RuntimeAIConfig | null>;
  clearError: () => void;
}

export function useRuntimeConfigLoader(): RuntimeConfigLoaderResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use a try-catch to safely get the context
  let updateConfigFn: (config: RuntimeAIConfig) => void = () => {};
  try {
    const runtimeConfig = useRuntimeConfig();
    updateConfigFn = runtimeConfig.updateConfig;
  } catch (e) {
    console.warn("RuntimeConfigProvider not available yet, updates won't be propagated");
  }

  const loadConfig = useCallback(async (): Promise<RuntimeAIConfig | null> => {
    if (isLoading) return null;

    try {
      setIsLoading(true);
      setError(null);

      // Get the token from Rust's secure storage
      const token = await invoke<string | null>('get_app_jwt');
      
      if (!token) {
        console.error("Cannot load config without a valid token");
        setError("Authentication token not available.");
        return null;
      }

      // Load the runtime config using the backend token
      const config = await loadRuntimeConfigAfterLogin();
      updateConfigFn(config);

      return config;
    } catch (err) {
      console.error("Failed to load runtime config:", err);
      const errorMessage =
        err instanceof Error
          ? `Configuration Error: ${err.message}`
          : "Failed to load configuration. Please try again.";

      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [updateConfigFn]);

  const clearError = useCallback(() => {
    if (error) setError(null);
  }, [error]);

  return {
    isLoading,
    error,
    loadConfig,
    clearError,
  };
}
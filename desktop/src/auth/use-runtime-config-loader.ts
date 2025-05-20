import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

import {
  loadRuntimeConfigAfterLogin,
  type RuntimeAiConfig,
  useRuntimeConfig,
} from "../contexts/runtime-config-context";

export interface RuntimeConfigLoaderResult {
  isLoading: boolean;
  error: string | null;
  loadConfig: (token: string) => Promise<RuntimeAiConfig | null>;
  clearError: () => void;
}

export function useRuntimeConfigLoader(): RuntimeConfigLoaderResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { updateConfig } = useRuntimeConfig();

  const loadConfig = async (token: string): Promise<RuntimeAiConfig | null> => {
    if (isLoading) return null;

    try {
      setIsLoading(true);
      setError(null);

      // Store token in Rust's TokenManager
      await invoke("store_token", { token });

      // Load the runtime AI configuration
      const config = await loadRuntimeConfigAfterLogin();

      // Update the global runtime config context
      updateConfig(config);

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
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return {
    isLoading,
    error,
    loadConfig,
    clearError,
  };
}

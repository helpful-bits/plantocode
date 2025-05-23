/**
 * Runtime Configuration Context
 *
 * Provides application-wide access to runtime configuration.
 * Fetches and maintains the configuration state.
 */

import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

/**
 * Define the runtime AI config type to match Tauri backend expectations
 */
export interface RuntimeAIConfig {
  default_llm_model_id: string;
  default_voice_model_id: string;
  default_transcription_model_id: string;
  tasks: Record<string, {
    model: string;
    max_tokens: number;
    temperature: number;
  }>;
  available_models: {
    id: string;
    name: string;
    provider: string;
    description?: string;
    context_window?: number;
    price_per_input_token: number;
    price_per_output_token: number;
  }[];
  path_finder_settings: {
    max_files_with_content?: number;
    include_file_contents?: boolean;
    max_content_size_per_file?: number;
    max_file_count?: number;
    file_content_truncation_chars?: number;
    token_limit_buffer?: number;
  };
}

/**
 * Runtime config context type
 */
interface RuntimeConfigContextType {
  config: RuntimeAIConfig | null;
  isLoading: boolean;
  error: string | null;
  refreshConfig: () => Promise<RuntimeAIConfig | null>;
  updateConfig: (config: RuntimeAIConfig) => void;
  clearError: () => void;
}

// Context for the runtime config
const RuntimeConfigContext = createContext<RuntimeConfigContextType>({
  config: null,
  isLoading: false,
  error: null,
  refreshConfig: () => Promise.resolve(null),
  updateConfig: () => {},
  clearError: () => {},
});

/**
 * Provider component for runtime configuration
 */
export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeAIConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);

  /**
   * Fetch runtime configuration from the server
   * @param force - Whether to force refresh even if the config was recently fetched
   * @returns The fetched configuration or null on error
   */
  const fetchRuntimeConfig = useCallback(async (
    force: boolean = false
  ): Promise<RuntimeAIConfig | null> => {
    // Skip if already loading
    if (isLoading) return config;

    // Skip if recently fetched (within 5 minutes) unless forced
    const now = Date.now();
    if (!force && lastFetchTime && now - lastFetchTime < 5 * 60 * 1000) {
      return config;
    }

    try {
      setIsLoading(true);

      // Clear previous error if retrying
      if (error) setError(null);

      const configData = await invoke<RuntimeAIConfig>(
        "fetch_runtime_ai_config"
      );

      setConfig(configData);
      setLastFetchTime(now);
      return configData;
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to load runtime configuration";

      setError(errorMessage);
      console.error("Error loading runtime AI config:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, config, lastFetchTime, error]);

  /**
   * Update the runtime configuration (used by AuthFlowManager)
   * @param newConfig - The new configuration to set
   */
  const updateConfig = useCallback((newConfig: RuntimeAIConfig) => {
    setConfig(newConfig);
    setLastFetchTime(Date.now());
  }, []);

  /**
   * Clear any error state
   */
  const clearError = useCallback(() => {
    if (error) setError(null);
  }, [error]);

  return (
    <RuntimeConfigContext.Provider
      value={{
        config,
        isLoading,
        error,
        refreshConfig: () => fetchRuntimeConfig(true),
        updateConfig,
        clearError,
      }}
    >
      {children}
    </RuntimeConfigContext.Provider>
  );
}

/**
 * Hook to use the runtime config
 * @returns The runtime config context
 */
export function useRuntimeConfig() {
  const context = useContext(RuntimeConfigContext);

  if (context === undefined) {
    throw new Error(
      "useRuntimeConfig must be used within a RuntimeConfigProvider"
    );
  }

  return context;
}

/**
 * Function to trigger config loading after login
 * @returns The loaded configuration
 * @throws Error if loading fails
 */
export async function loadRuntimeConfigAfterLogin(): Promise<RuntimeAIConfig> {
  try {
    // Add retries for better resilience
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const config = await invoke<RuntimeAIConfig>("fetch_runtime_ai_config");
        return config;
      } catch (err) {
        attempts++;

        if (attempts >= maxAttempts) {
          throw err;
        }

        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
      }
    }

    // This shouldn't be reached due to the throw in the loop, but TypeScript requires a return
    throw new Error(
      "Failed to load runtime config after maximum retry attempts"
    );
  } catch (error) {
    console.error("Failed to load runtime config after login:", error);
    throw error;
  }
}

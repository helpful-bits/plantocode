/**
 * Runtime Configuration Context
 *
 * Provides application-wide access to runtime configuration.
 * Fetches and maintains the configuration state.
 */

import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Define the runtime AI config type
 */
export interface RuntimeAiConfig {
  models: {
    id: string;
    name: string;
    contextWindow: number;
    pricePerInputToken: number;
    pricePerOutputToken: number;
  }[];
  defaultSettings: {
    defaultModel: string;
    temperature: number;
    maxTokens: number;
  };
  limits: {
    maxTokensPerRequest: number;
    maxTokensPerMonth: number;
  };
}

/**
 * Runtime config context type
 */
interface RuntimeConfigContextType {
  config: RuntimeAiConfig | null;
  isLoading: boolean;
  error: string | null;
  refreshConfig: () => Promise<RuntimeAiConfig | null>;
  updateConfig: (config: RuntimeAiConfig) => void;
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
  const [config, setConfig] = useState<RuntimeAiConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);

  /**
   * Fetch runtime configuration from the server
   * @param force - Whether to force refresh even if the config was recently fetched
   * @returns The fetched configuration or null on error
   */
  const fetchRuntimeConfig = async (
    force: boolean = false
  ): Promise<RuntimeAiConfig | null> => {
    // Skip if already loading
    if (isLoading) return config;

    // Skip if recently fetched (within 5 minutes) unless forced
    const now = Date.now();
    if (!force && lastFetchTime && now - lastFetchTime < 5 * 60 * 1000) {
      // Log removed for linting
      // console.log(
      //   "Using cached runtime config (fetched within last 5 minutes)"
      // );
      return config;
    }

    try {
      setIsLoading(true);

      // Clear previous error if retrying
      if (error) setError(null);

      const configData = await invoke<RuntimeAiConfig>(
        "fetch_runtime_ai_config"
      );

      // Add default token limits if not provided
      if (!configData.limits) {
        configData.limits = {
          maxTokensPerRequest: 10000,
          maxTokensPerMonth: 1000000,
        };
      }

      setConfig(configData);
      setLastFetchTime(now);
      // Log removed for linting
      // console.log("Runtime AI config loaded:", configData);
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
  };

  /**
   * Update the runtime configuration (used by AuthFlowManager)
   * @param newConfig - The new configuration to set
   */
  const updateConfig = (newConfig: RuntimeAiConfig) => {
    setConfig(newConfig);
    setLastFetchTime(Date.now());
  };

  /**
   * Clear any error state
   */
  const clearError = () => {
    if (error) setError(null);
  };

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
export async function loadRuntimeConfigAfterLogin(): Promise<RuntimeAiConfig> {
  try {
    // Log removed for linting
    // console.log("Triggering runtime config load after login...");

    // Add retries for better resilience
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const config = await invoke<RuntimeAiConfig>("fetch_runtime_ai_config");
        // Log removed for linting
        // console.log("Runtime AI config loaded successfully after login");
        return config;
      } catch (err) {
        attempts++;

        if (attempts >= maxAttempts) {
          throw err;
        }

        // Wait before retry (exponential backoff)
        // Log removed for linting
        // console.log(
        //   `Retry attempt ${attempts}/${maxAttempts} for runtime config...`
        // );
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

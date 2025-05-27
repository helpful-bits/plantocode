/**
 * Runtime Configuration Context
 *
 * Provides application-wide access to runtime configuration.
 * Fetches and maintains the configuration state.
 */

import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "RuntimeConfigContext" });

/**
 * Define the runtime AI config type to match Tauri backend expectations
 */
export interface RuntimeAIConfig {
  defaultLlmModelId: string;
  defaultVoiceModelId: string;
  defaultTranscriptionModelId: string;
  tasks: Record<string, {
    model: string;
    maxTokens: number;
    temperature: number;
  }>;
  availableModels: {
    id: string;
    name: string;
    provider: string;
    description?: string;
    contextWindow?: number;
    pricePerInputToken: number;
    pricePerOutputToken: number;
  }[];
  pathFinderSettings: {
    maxFilesWithContent?: number;
    includeFileContents?: boolean;
    maxContentSizePerFile?: number;
    maxFileCount?: number;
    fileContentTruncationChars?: number;
    tokenLimitBuffer?: number;
  };
  limits: {
    maxTokensPerRequest?: number;
    maxTokensPerMonth?: number;
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
      logger.error("Error loading runtime AI config:", err);
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

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    config,
    isLoading,
    error,
    refreshConfig: () => fetchRuntimeConfig(true),
    updateConfig,
    clearError,
  }), [config, isLoading, error, fetchRuntimeConfig, updateConfig, clearError]);

  return (
    <RuntimeConfigContext.Provider value={contextValue}>
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
    logger.error("Failed to load runtime config after login:", error);
    throw error;
  }
}

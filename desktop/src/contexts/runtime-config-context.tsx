/**
 * Runtime Configuration Context
 *
 * Provides application-wide access to runtime configuration.
 * Fetches and maintains the configuration state.
 */

import { invoke } from "@tauri-apps/api/core";
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import { createLogger } from "@/utils/logger";
import { logError } from "@/utils/error-handling";
import { 
  getTranscriptionConfig
} from "@/actions/config.actions";

const logger = createLogger({ namespace: "RuntimeConfigContext" });

/**
 * Import types from config-types to ensure consistency
 */
import type { 
  RuntimeAIConfig, 
  TranscriptionConfig, 
  TranscriptionSettings,
  TranscriptionUserPreferences 
} from "@/types/config-types";

// Re-export types for external use
export type { RuntimeAIConfig, TranscriptionConfig, TranscriptionSettings, TranscriptionUserPreferences };

/**
 * Local storage keys for transcription settings persistence
 */
const TRANSCRIPTION_SETTINGS_STORAGE_KEY = "transcription-settings";
const TRANSCRIPTION_USER_PREFERENCES_STORAGE_KEY = "transcription-user-preferences";
const TRANSCRIPTION_CACHE_EXPIRY_KEY = "transcription-cache-expiry";
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Runtime config context type
 */
interface RuntimeConfigContextType {
  config: RuntimeAIConfig | null;
  transcriptionConfig: TranscriptionConfig | null;
  transcriptionSettings: TranscriptionSettings | null;
  userPreferences: TranscriptionUserPreferences | null;
  isLoading: boolean;
  isLoadingTranscription: boolean;
  isUpdatingSettings: boolean;
  error: string | null;
  transcriptionError: string | null;
  settingsError: string | null;
  refreshConfig: () => Promise<RuntimeAIConfig | null>;
  refreshTranscriptionConfig: () => Promise<TranscriptionConfig | null>;
  updateConfig: (config: RuntimeAIConfig) => void;
  updateTranscriptionConfig: (config: TranscriptionConfig) => void;
  getTranscriptionSettings: () => Promise<TranscriptionSettings | null>;
  updateTranscriptionSettings: (settings: Partial<TranscriptionSettings>) => Promise<boolean>;
  resetTranscriptionSettings: () => Promise<boolean>;
  validateSettings: (settings: TranscriptionSettings) => Promise<{ isValid: boolean; errors: string[] }>;
  updateUserPreferences: (preferences: Partial<TranscriptionUserPreferences>) => Promise<boolean>;
  clearError: () => void;
  clearTranscriptionError: () => void;
  clearSettingsError: () => void;
  migrateForExistingUser: () => Promise<{ migrated: boolean; changes: string[] }>;
}

// Context for the runtime config
const RuntimeConfigContext = createContext<RuntimeConfigContextType>({
  config: null,
  transcriptionConfig: null,
  transcriptionSettings: null,
  userPreferences: null,
  isLoading: false,
  isLoadingTranscription: false,
  isUpdatingSettings: false,
  error: null,
  transcriptionError: null,
  settingsError: null,
  refreshConfig: () => Promise.resolve(null),
  refreshTranscriptionConfig: () => Promise.resolve(null),
  updateConfig: () => {},
  updateTranscriptionConfig: () => {},
  getTranscriptionSettings: () => Promise.resolve(null),
  updateTranscriptionSettings: () => Promise.resolve(false),
  resetTranscriptionSettings: () => Promise.resolve(false),
  validateSettings: () => Promise.resolve({ isValid: false, errors: [] }),
  updateUserPreferences: () => Promise.resolve(false),
  clearError: () => {},
  clearTranscriptionError: () => {},
  clearSettingsError: () => {},
  migrateForExistingUser: () => Promise.resolve({ migrated: false, changes: [] }),
});

/**
 * Provider component for runtime configuration
 */
export function RuntimeConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeAIConfig | null>(null);
  const [transcriptionConfig, setTranscriptionConfig] = useState<TranscriptionConfig | null>(null);
  const [transcriptionSettings, setTranscriptionSettings] = useState<TranscriptionSettings | null>(null);
  const [userPreferences, setUserPreferences] = useState<TranscriptionUserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingTranscription, setIsLoadingTranscription] = useState<boolean>(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<number | null>(null);
  const [lastTranscriptionFetchTime, setLastTranscriptionFetchTime] = useState<number | null>(null);

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
   * Fetch transcription configuration
   * @param force - Whether to force refresh even if the config was recently fetched
   * @returns The fetched transcription configuration or null on error
   */
  const fetchTranscriptionConfigFunc = useCallback(async (
    force: boolean = false
  ): Promise<TranscriptionConfig | null> => {
    // Skip if already loading
    if (isLoadingTranscription) return transcriptionConfig;

    // Skip if recently fetched (within 5 minutes) unless forced
    const now = Date.now();
    if (!force && lastTranscriptionFetchTime && now - lastTranscriptionFetchTime < 5 * 60 * 1000) {
      return transcriptionConfig;
    }

    try {
      setIsLoadingTranscription(true);

      // Clear previous error if retrying
      if (transcriptionError) setTranscriptionError(null);

      const result = await getTranscriptionConfig();
      
      if (result.isSuccess && result.data) {
        setTranscriptionConfig(result.data);
        setLastTranscriptionFetchTime(now);
        return result.data;
      } else {
        throw new Error(result.message || "Failed to fetch transcription config");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to load transcription configuration";

      setTranscriptionError(errorMessage);
      logger.error("Error loading transcription config:", err);
      return null;
    } finally {
      setIsLoadingTranscription(false);
    }
  }, [isLoadingTranscription, transcriptionConfig, lastTranscriptionFetchTime, transcriptionError]);

  /**
   * Update the runtime configuration (used by AuthFlowManager)
   * @param newConfig - The new configuration to set
   */
  const updateConfig = useCallback((newConfig: RuntimeAIConfig) => {
    setConfig(newConfig);
    setLastFetchTime(Date.now());
  }, []);

  /**
   * Update the transcription configuration
   * @param newConfig - The new transcription configuration to set
   */
  const updateTranscriptionConfig = useCallback((newConfig: TranscriptionConfig) => {
    setTranscriptionConfig(newConfig);
    setLastTranscriptionFetchTime(Date.now());
  }, []);

  /**
   * Clear any error state
   */
  const clearError = useCallback(() => {
    if (error) setError(null);
  }, [error]);

  /**
   * Clear transcription error state
   */
  const clearTranscriptionError = useCallback(() => {
    if (transcriptionError) setTranscriptionError(null);
  }, [transcriptionError]);

  /**
   * Clear settings error state
   */
  const clearSettingsError = useCallback(() => {
    if (settingsError) setSettingsError(null);
  }, [settingsError]);

  // ================================
  // Local Storage Persistence
  // ================================

  /**
   * Load transcription settings from local storage (unused but kept for compatibility)
   */
  // loadSettingsFromStorage function removed - no longer needed

  /**
   * Save transcription settings to local storage
   */
  const saveSettingsToStorage = useCallback((settings: TranscriptionSettings) => {
    try {
      if (typeof window === 'undefined') return;
      
      localStorage.setItem(TRANSCRIPTION_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      localStorage.setItem(TRANSCRIPTION_CACHE_EXPIRY_KEY, (Date.now() + CACHE_DURATION_MS).toString());
    } catch (error) {
      logger.warn('Failed to save transcription settings to storage:', error);
    }
  }, []);

  /**
   * Load user preferences from local storage
   */
  const loadUserPreferencesFromStorage = useCallback((): TranscriptionUserPreferences | null => {
    try {
      if (typeof window === 'undefined') return null;
      
      const stored = localStorage.getItem(TRANSCRIPTION_USER_PREFERENCES_STORAGE_KEY);
      return stored ? JSON.parse(stored) as TranscriptionUserPreferences : null;
    } catch (error) {
      logger.warn('Failed to load user preferences from storage:', error);
      return null;
    }
  }, []);

  /**
   * Save user preferences to local storage
   */
  const saveUserPreferencesToStorage = useCallback((preferences: TranscriptionUserPreferences) => {
    try {
      if (typeof window === 'undefined') return;
      
      localStorage.setItem(TRANSCRIPTION_USER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      logger.warn('Failed to save user preferences to storage:', error);
    }
  }, []);

  // ================================
  // Transcription Settings Actions
  // ================================

  /**
   * Get transcription settings from config (simplified)
   */
  const getTranscriptionSettingsFunc = useCallback(async (): Promise<TranscriptionSettings | null> => {
    // Use transcription settings from the main config
    if (config?.transcriptionConfig?.settings) {
      setTranscriptionSettings(config.transcriptionConfig.settings);
      return config.transcriptionConfig.settings;
    }
    return null;
  }, [config]);

  /**
   * Update transcription settings (simplified)
   */
  const updateTranscriptionSettingsFunc = useCallback(async (
    settingsUpdate: Partial<TranscriptionSettings>
  ): Promise<boolean> => {
    try {
      setIsUpdatingSettings(true);
      clearSettingsError();

      // Merge with existing settings
      const updatedSettings = { ...transcriptionSettings, ...settingsUpdate } as TranscriptionSettings;
      setTranscriptionSettings(updatedSettings);
      saveSettingsToStorage(updatedSettings);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update transcription settings';
      setSettingsError(errorMessage);
      logger.error('Error updating transcription settings:', error);
      return false;
    } finally {
      setIsUpdatingSettings(false);
    }
  }, [transcriptionSettings, saveSettingsToStorage]);

  /**
   * Reset transcription settings to defaults (simplified)
   */
  const resetTranscriptionSettingsFunc = useCallback(async (): Promise<boolean> => {
    try {
      setIsUpdatingSettings(true);
      clearSettingsError();

      // Clear local storage
      localStorage.removeItem(TRANSCRIPTION_SETTINGS_STORAGE_KEY);
      localStorage.removeItem(TRANSCRIPTION_CACHE_EXPIRY_KEY);
      
      // Reset to empty settings
      setTranscriptionSettings(null);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reset transcription settings';
      setSettingsError(errorMessage);
      logger.error('Error resetting transcription settings:', error);
      return false;
    } finally {
      setIsUpdatingSettings(false);
    }
  }, []);

  /**
   * Validate transcription settings (simplified)
   */
  const validateSettingsFunc = useCallback(async (
    settings: TranscriptionSettings
  ): Promise<{ isValid: boolean; errors: string[] }> => {
    // Basic validation
    const errors: string[] = [];
    
    if (settings.temperature && (settings.temperature < 0 || settings.temperature > 1)) {
      errors.push('Temperature must be between 0 and 1');
    }
    
    return { isValid: errors.length === 0, errors };
  }, []);

  /**
   * Update user preferences
   */
  const updateUserPreferencesFunc = useCallback(async (
    preferencesUpdate: Partial<TranscriptionUserPreferences>
  ): Promise<boolean> => {
    try {
      const updatedPreferences = { ...userPreferences, ...preferencesUpdate } as TranscriptionUserPreferences;
      setUserPreferences(updatedPreferences);
      saveUserPreferencesToStorage(updatedPreferences);
      return true;
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      return false;
    }
  }, [userPreferences, saveUserPreferencesToStorage]);

  /**
   * Migrate transcription settings for existing users
   */
  const migrateForExistingUserFunc = useCallback(async (): Promise<{ migrated: boolean; changes: string[] }> => {
    try {
      // Migration no longer needed - using simplified settings
      const result = { isSuccess: true, data: { migrated: false, changes: [] } };
      
      if (result.isSuccess && result.data) {
        if (result.data.migrated) {
          // Clear cache to force refresh with migrated settings
          localStorage.removeItem(TRANSCRIPTION_SETTINGS_STORAGE_KEY);
          localStorage.removeItem(TRANSCRIPTION_CACHE_EXPIRY_KEY);
          
          // Refetch settings after migration
          await getTranscriptionSettingsFunc();
        }
        
        return result.data;
      } else {
        return {
          migrated: false,
          changes: []
        };
      }
    } catch (error) {
      logger.error('Error during transcription settings migration:', error);
      return {
        migrated: false,
        changes: []
      };
    }
  }, [getTranscriptionSettingsFunc]);

  // ================================
  // Initialization Effects
  // ================================

  /**
   * Initialize transcription settings and user preferences on mount
   */
  useEffect(() => {
    const initializeTranscriptionData = async () => {
      // Load user preferences from storage immediately
      const storedPreferences = loadUserPreferencesFromStorage();
      if (storedPreferences) {
        setUserPreferences(storedPreferences);
      }

      // Load settings (with caching)
      await getTranscriptionSettingsFunc();
    };

    initializeTranscriptionData().catch(error => {
      logger.error('Failed to initialize transcription data:', error);
    });
  }, [loadUserPreferencesFromStorage, getTranscriptionSettingsFunc]);

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    config,
    transcriptionConfig,
    transcriptionSettings,
    userPreferences,
    isLoading,
    isLoadingTranscription,
    isUpdatingSettings,
    error,
    transcriptionError,
    settingsError,
    refreshConfig: () => fetchRuntimeConfig(true),
    refreshTranscriptionConfig: () => fetchTranscriptionConfigFunc(true),
    updateConfig,
    updateTranscriptionConfig,
    getTranscriptionSettings: getTranscriptionSettingsFunc,
    updateTranscriptionSettings: updateTranscriptionSettingsFunc,
    resetTranscriptionSettings: resetTranscriptionSettingsFunc,
    validateSettings: validateSettingsFunc,
    updateUserPreferences: updateUserPreferencesFunc,
    clearError,
    clearTranscriptionError,
    clearSettingsError,
    migrateForExistingUser: migrateForExistingUserFunc,
  }), [
    config,
    transcriptionConfig,
    transcriptionSettings,
    userPreferences,
    isLoading,
    isLoadingTranscription,
    isUpdatingSettings,
    error,
    transcriptionError,
    settingsError,
    fetchRuntimeConfig,
    fetchTranscriptionConfigFunc,
    updateConfig,
    updateTranscriptionConfig,
    getTranscriptionSettingsFunc,
    updateTranscriptionSettingsFunc,
    resetTranscriptionSettingsFunc,
    validateSettingsFunc,
    updateUserPreferencesFunc,
    clearError,
    clearTranscriptionError,
    clearSettingsError,
    migrateForExistingUserFunc,
  ]);

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
    const error = new Error(
      "useRuntimeConfig must be used within a RuntimeConfigProvider"
    );
    logError(error, "Runtime Config Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }

  return context;
}

/**
 * Hook specifically for transcription settings
 * @returns Transcription-specific context methods and state
 */
export function useTranscriptionSettings() {
  const {
    transcriptionSettings,
    userPreferences,
    isUpdatingSettings,
    settingsError,
    getTranscriptionSettings,
    updateTranscriptionSettings,
    resetTranscriptionSettings,
    validateSettings,
    updateUserPreferences,
    clearSettingsError,
    migrateForExistingUser,
  } = useRuntimeConfig();

  return {
    settings: transcriptionSettings,
    userPreferences,
    isUpdating: isUpdatingSettings,
    error: settingsError,
    getSettings: getTranscriptionSettings,
    updateSettings: updateTranscriptionSettings,
    resetSettings: resetTranscriptionSettings,
    validateSettings,
    updateUserPreferences,
    clearError: clearSettingsError,
    migrateForExistingUser,
  };
}

/**
 * Hook for transcription configuration (settings + templates + preferences)
 * @returns Full transcription configuration context
 */
export function useTranscriptionConfig() {
  const {
    transcriptionConfig,
    isLoadingTranscription,
    transcriptionError,
    refreshTranscriptionConfig,
    updateTranscriptionConfig,
    clearTranscriptionError,
  } = useRuntimeConfig();

  return {
    config: transcriptionConfig,
    isLoading: isLoadingTranscription,
    error: transcriptionError,
    refreshConfig: refreshTranscriptionConfig,
    updateConfig: updateTranscriptionConfig,
    clearError: clearTranscriptionError,
  };
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

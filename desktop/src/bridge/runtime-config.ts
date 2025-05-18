import { invoke } from '@tauri-apps/api/tauri';
import { createContext, useContext, useState, useEffect } from 'react';

// Define the runtime AI config type
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
}

// Context for the runtime config
const RuntimeConfigContext = createContext<{
  config: RuntimeAiConfig | null;
  isLoading: boolean;
  error: string | null;
  refreshConfig: () => Promise<void>;
}>({
  config: null,
  isLoading: false,
  error: null,
  refreshConfig: async () => {},
});

// Provider component
export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<RuntimeAiConfig | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRuntimeConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const configData = await invoke<RuntimeAiConfig>('fetch_runtime_ai_config');
      
      setConfig(configData);
      console.log('Runtime AI config loaded:', configData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load runtime configuration';
      setError(errorMessage);
      console.error('Error loading runtime AI config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Hook to fetch config after login
  useEffect(() => {
    // The initial fetch should be triggered by the app.tsx after successful login
    // This avoids dependency ordering issues with Stronghold
  }, []);

  return (
    <RuntimeConfigContext.Provider
      value={{
        config,
        isLoading,
        error,
        refreshConfig: fetchRuntimeConfig,
      }}
    >
      {children}
    </RuntimeConfigContext.Provider>
  );
}

// Hook to use the runtime config
export function useRuntimeConfig() {
  const context = useContext(RuntimeConfigContext);
  
  if (context === undefined) {
    throw new Error('useRuntimeConfig must be used within a RuntimeConfigProvider');
  }
  
  return context;
}

// Export a function to trigger config loading after login
export async function loadRuntimeConfigAfterLogin() {
  try {
    console.log('Triggering runtime config load after login...');
    const config = await invoke<RuntimeAiConfig>('fetch_runtime_ai_config');
    console.log('Runtime AI config loaded successfully after login');
    return config;
  } catch (error) {
    console.error('Failed to load runtime config after login:', error);
    throw error;
  }
}
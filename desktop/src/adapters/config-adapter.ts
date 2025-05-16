/**
 * Configuration Adapter for Desktop
 * 
 * Provides adapters for configuration-related operations when running
 * in the desktop environment.
 */

import { ConfigClientAdapter, RuntimeAiConfig, ModelInfo, TaskSpecificModelConfig } from './api-client-adapter';

// Singleton instance
const configClient = new ConfigClientAdapter();

/**
 * Fetch runtime AI configuration from the server
 */
export async function fetchRuntimeAiConfig(): Promise<RuntimeAiConfig> {
  return configClient.fetchRuntimeAiConfig();
}

/**
 * Get available AI models from the cached configuration
 */
export async function getAvailableAiModels(): Promise<ModelInfo[]> {
  return configClient.getAvailableAiModels();
}

/**
 * Get default task configurations from the cached configuration
 */
export async function getDefaultTaskConfigurations(): Promise<Record<string, TaskSpecificModelConfig>> {
  return configClient.getDefaultTaskConfigurations();
}

// Export the adapter directly for more complex usage
export { configClient };

// Re-export types for convenience
export type { RuntimeAiConfig, ModelInfo, TaskSpecificModelConfig, PathFinderSettings } from './api-client-adapter';
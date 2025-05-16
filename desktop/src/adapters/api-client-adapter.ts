/**
 * API Client Adapter for Desktop App
 * 
 * Provides adapters for core API clients to use the server proxy
 * when running in the desktop environment.
 */

import { getToken } from '@/auth/token-storage';
import { invoke } from '@tauri-apps/api/core';

// Server URL from environment variables
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';

/**
 * Types for runtime AI configuration
 */
export interface TaskSpecificModelConfig {
  model: string;
  max_tokens: number;
  temperature: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  context_window?: number;
}

export interface PathFinderSettings {
  max_files_with_content?: number;
  include_file_contents?: boolean;
  max_content_size_per_file?: number;
  max_file_count?: number;
  file_content_truncation_chars?: number;
  token_limit_buffer?: number;
}

export interface RuntimeAiConfig {
  default_llm_model_id: string;
  default_voice_model_id: string;
  default_transcription_model_id: string;
  tasks: Record<string, TaskSpecificModelConfig>;
  available_models: ModelInfo[];
  path_finder_settings: PathFinderSettings;
}

/**
 * Create headers with authentication token
 */
async function createAuthHeaders(): Promise<HeadersInit> {
  const token = await getToken();
  
  if (!token) {
    throw new Error('Authentication token not found');
  }
  
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

// Removed GeminiClientAdapter - all AI interactions now use OpenRouterClientAdapter

// Removed ClaudeClientAdapter - all AI interactions now use OpenRouterClientAdapter


/**
 * OpenRouter API client adapter for desktop
 */
export class OpenRouterClientAdapter {
  /**
   * Send a request to OpenRouter via the proxy
   */
  async sendRequest(payload: any): Promise<any> {
    const headers = await createAuthHeaders();
    
    const response = await fetch(`${SERVER_URL}/api/proxy/openrouter/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`OpenRouter API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Send a streaming request to OpenRouter via the proxy
   */
  async sendStreamingRequest(payload: any): Promise<ReadableStream<Uint8Array>> {
    const headers = await createAuthHeaders();
    
    // Ensure streaming is enabled
    payload.stream = true;
    
    const response = await fetch(`${SERVER_URL}/api/proxy/openrouter/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`OpenRouter streaming API request failed: ${response.statusText}`);
    }
    
    return response.body!;
  }
  
  /**
   * Transcribe audio using OpenRouter via the server proxy
   * 
   * Note: Since browser FormData handling is complex with files,
   * this method delegates the transcription to the Tauri command,
   * which will use the Rust ServerProxyClient to handle the request.
   */
  async transcribe(audioData: Uint8Array, filename: string, model: string): Promise<string> {
    try {
      // Use direct transcription command that uses the ServerProxyClient with the updated endpoint
      const response = await import('@tauri-apps/api/core').then(
        ({ invoke }) => invoke('direct_transcribe_audio_command', { 
          audio_data: Array.from(audioData), // Converts Uint8Array to number[] which Rust Vec<u8> can handle
          filename,
          model
        })
      );
      
      // The command returns an object with a 'text' field
      const result = response as { text: string };
      return result.text;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`OpenRouter transcription failed: ${error}`);
    }
  }
}

/**
 * Configuration API client adapter for desktop
 */
export class ConfigClientAdapter {
  /**
   * Fetch runtime AI configuration from the server
   * 
   * In desktop mode, this uses the Tauri command to fetch the configuration
   * directly from the server, which then caches it in the app state.
   */
  async fetchRuntimeAiConfig(): Promise<RuntimeAiConfig> {
    try {
      const config = await invoke<RuntimeAiConfig>('fetch_runtime_ai_config');
      return config;
    } catch (error) {
      console.error('Failed to fetch runtime AI config:', error);
      throw new Error(`Failed to fetch runtime AI config: ${error}`);
    }
  }
  
  /**
   * Get available AI models from the cached configuration
   */
  async getAvailableAiModels(): Promise<ModelInfo[]> {
    try {
      const models = await invoke<ModelInfo[]>('get_available_ai_models');
      return models;
    } catch (error) {
      console.error('Failed to get available AI models:', error);
      throw new Error(`Failed to get available AI models: ${error}`);
    }
  }
  
  /**
   * Get default task configurations from the cached configuration
   */
  async getDefaultTaskConfigurations(): Promise<Record<string, TaskSpecificModelConfig>> {
    try {
      const configs = await invoke<Record<string, TaskSpecificModelConfig>>('get_default_task_configurations');
      return configs;
    } catch (error) {
      console.error('Failed to get default task configurations:', error);
      throw new Error(`Failed to get default task configurations: ${error}`);
    }
  }
}
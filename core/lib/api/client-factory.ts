/**
 * API Client Factory
 *
 * Provides a centralized way to access different API clients (Gemini, Claude, etc.)
 * with consistent error handling and response formatting.
 *
 * This module serves as the central registry for all API clients and provides
 * type-safe access to them through:
 * 1. The apiClients object with strongly-typed properties
 * 2. The getApiClient function for dynamic client selection
 */

import { ApiType } from '@/types/session-types';
import { ApiClient } from './api-client-interface';
import geminiClient from './clients/gemini';
import claudeClient from './claude-client';
import groqApiClient from './clients/groq';

// Type the client registry with a union type that allows undefined for unavailable clients
type ApiClientRegistry = {
  [K in ApiType]: K extends 'gemini' ? typeof geminiClient :
                  K extends 'claude' ? typeof claudeClient :
                  K extends 'groq' ? typeof groqApiClient :
                  undefined;
};

// A registry of available clients with proper type assertions
const clientRegistry: ApiClientRegistry = {
  'gemini': geminiClient,
  'claude': claudeClient,
  'whisper': undefined, // Placeholder for future implementation
  'groq': groqApiClient, // Groq API client for Whisper transcription
};

/**
 * Get an API client by type with proper TypeScript typing
 *
 * @param type - The API type to get a client for
 * @returns The requested client with appropriate type
 * @throws Error if the requested client is not available
 */
export function getApiClient<T extends ApiType>(type: T): NonNullable<ApiClientRegistry[T]> {
  const client = clientRegistry[type];

  if (!client) {
    throw new Error(`API client for ${type} is not available.`);
  }

  return client as NonNullable<ApiClientRegistry[T]>;
}

/**
 * Check if a specific API client is available
 *
 * @param type - The API type to check
 * @returns True if the client is available, false otherwise
 */
export function isClientAvailable(type: ApiType): boolean {
  return !!clientRegistry[type];
}

/**
 * Get all available API client types
 *
 * @returns Array of available API client types
 */
export function getAvailableClientTypes(): ApiType[] {
  return Object.keys(clientRegistry).filter(key =>
    !!clientRegistry[key as ApiType]
  ) as ApiType[];
}

/**
 * A utility object with methods to get specific client implementations
 * with proper TypeScript typing for better IDE auto-completion
 */
export const apiClients = {
  /**
   * Get the Gemini API client
   */
  get gemini() {
    return geminiClient;
  },

  /**
   * Get the Claude API client
   */
  get claude() {
    return claudeClient;
  },

  /**
   * Get the Groq API client (primarily for Whisper transcription)
   */
  get groq() {
    return groqApiClient;
  },

  /**
   * Get an API client by type (alias for getApiClient with appropriate typing)
   */
  get<T extends ApiType>(type: T): NonNullable<ApiClientRegistry[T]> {
    return getApiClient(type);
  }
};

export default apiClients;
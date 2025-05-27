import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@/utils/logger';

const logger = createLogger({ namespace: "SecuredFetch" });

/**
 * Type for secured fetch options
 * Extends the standard RequestInit with additional options
 */
export type SecuredFetchOptions = RequestInit & {
  /**
   * Should authentication be skipped for this request?
   * Default: false
   */
  skipAuth?: boolean;
};

/**
 * Token-aware fetch wrapper that automatically includes authentication headers
 * 
 * This function:
 * 1. Automatically adds the app JWT as a Bearer token in Authorization header
 * 2. Handles token refreshing if needed
 * 
 * @param url The URL to fetch
 * @param options Fetch options, extends standard RequestInit
 * @returns Promise resolving to the fetch Response
 */
export async function securedFetch(
  url: string | URL | Request,
  options: SecuredFetchOptions = {}
): Promise<Response> {
  // Clone the headers to avoid mutating the caller's object
  const headers = new Headers(options.headers || {});
  
  // Add authentication unless explicitly skipped
  if (!options.skipAuth) {
    try {
      // Get the app JWT from the Rust backend
      const token = await invoke<string | null>('get_app_jwt');
      
      if (token) {
        // Add the Bearer token to the Authorization header
        headers.set('Authorization', `Bearer ${token}`);
      } else {
        logger.warn('[securedFetch] No authentication token available');
      }
    } catch (error) {
      logger.error('[securedFetch] Error getting authentication token:', error);
    }
  }
  
  // Client ID binding is automatically handled on the Rust side
  
  // Create the final options with the enhanced headers
  const fetchOptions: RequestInit = {
    ...options,
    headers,
  };
  
  // Execute the fetch
  return fetch(url, fetchOptions);
}

/**
 * Helper function for securedFetch with JSON handling
 * 
 * @param url The URL to fetch
 * @param options Fetch options
 * @returns Promise resolving to the parsed JSON response
 */
export async function securedFetchJson<T = any>(
  url: string | URL | Request,
  options: SecuredFetchOptions = {}
): Promise<T> {
  // Set content type if not already set
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }
  
  // If body is an object, JSON stringify it
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
    body = JSON.stringify(body);
  }
  
  const response = await securedFetch(url, {
    ...options,
    headers,
    body,
  });
  
  // Handle non-2xx responses
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  
  // Parse JSON
  return response.json() as Promise<T>;
}

/**
 * Helper function for securedFetch with text handling
 * 
 * @param url The URL to fetch
 * @param options Fetch options
 * @returns Promise resolving to the text response
 */
export async function securedFetchText(
  url: string | URL | Request,
  options: SecuredFetchOptions = {}
): Promise<string> {
  const response = await securedFetch(url, options);
  
  // Handle non-2xx responses
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  
  return response.text();
}
/**
 * Utility functions for API handling
 */

import { ActionState } from "../../types/action-types";
import { ErrorType, createError, createErrorState, createSuccessState } from "./error-handling";
import { withTimeout } from "./async-utils";

/**
 * Standard response codes and messages used across the application
 */
export const ApiResponseCode = {
  SUCCESS: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Maps HTTP status codes to error types
 */
export function mapStatusToErrorType(status: number): ErrorType {
  switch (status) {
    case ApiResponseCode.BAD_REQUEST:
      return ErrorType.VALIDATION_ERROR;
    case ApiResponseCode.UNAUTHORIZED:
    case ApiResponseCode.FORBIDDEN:
      return ErrorType.PERMISSION_ERROR;
    case ApiResponseCode.NOT_FOUND:
      return ErrorType.NOT_FOUND_ERROR;
    case ApiResponseCode.TOO_MANY_REQUESTS:
      return ErrorType.API_ERROR;
    case ApiResponseCode.INTERNAL_ERROR:
      return ErrorType.INTERNAL_ERROR;
    case ApiResponseCode.SERVICE_UNAVAILABLE:
      return ErrorType.API_ERROR;
    default:
      return ErrorType.UNKNOWN_ERROR;
  }
}

/**
 * Type for enhanced fetch options
 */
export interface EnhancedFetchOptions extends RequestInit {
  timeout?: number;
  parseJson?: boolean;
  retries?: number;
  retryDelay?: number;
}

/**
 * Enhanced fetch function with timeout, error handling, and optional JSON parsing
 */
export async function enhancedFetch<T = any>(
  url: string,
  options: EnhancedFetchOptions = {}
): Promise<ActionState<T>> {
  const {
    timeout = 30000,
    parseJson = true,
    retries = 0,
    retryDelay = 1000,
    ...fetchOptions
  } = options;

  // Add default headers
  const headers = new Headers(fetchOptions.headers);
  if (!headers.has("Content-Type") && fetchOptions.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Add timeout to the fetch request
        const fetchPromise = fetch(url, {
          ...fetchOptions,
          headers
        });
        
        const response = await withTimeout(fetchPromise, timeout, `Request to ${url} timed out after ${timeout}ms`);
        
        // Check if response is ok
        if (!response.ok) {
          const errorBody = await response.text();
          const errorType = mapStatusToErrorType(response.status);
          let errorMessage: string;
          
          try {
            // Try to parse error body as JSON
            const errorJson = JSON.parse(errorBody);
            errorMessage = errorJson.message || errorJson.error || `API error: ${response.status} ${response.statusText}`;
          } catch {
            // Use text body if not JSON
            errorMessage = errorBody || `API error: ${response.status} ${response.statusText}`;
          }
          
          throw createError(errorMessage, errorType, { statusCode: response.status });
        }
        
        // Parse response body
        let data: T;
        if (parseJson) {
          data = await response.json();
        } else {
          // @ts-expect-error Text response is acceptable for non-JSON responses
          data = await response.text();
        }
        
        return createSuccessState(data);
      } catch (error: any) {
        // If this is the last attempt, throw the error
        if (attempt === retries) {
          throw error;
        }
        
        // Wait before next retry
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
      }
    }
    
    // This should never be reached because of the throw in the catch block
    throw new Error("Unexpected error in enhancedFetch");
  } catch (error: any) {
    return createErrorState(error);
  }
}

/**
 * Wrapper for safely sending JSON requests
 */
export async function sendJsonRequest<T = any, U = any>(
  url: string,
  method: string,
  data?: U,
  options: Omit<EnhancedFetchOptions, 'method' | 'body'> = {}
): Promise<ActionState<T>> {
  const fetchOptions: EnhancedFetchOptions = {
    method,
    ...options
  };
  
  if (data) {
    fetchOptions.body = JSON.stringify(data);
  }
  
  return enhancedFetch<T>(url, fetchOptions);
}

/**
 * Convenience function for GET requests
 */
export async function getJson<T = any>(
  url: string,
  options: Omit<EnhancedFetchOptions, 'method'> = {}
): Promise<ActionState<T>> {
  return sendJsonRequest<T>(url, 'GET', undefined, options);
}

/**
 * Convenience function for POST requests
 */
export async function postJson<T = any, U = any>(
  url: string,
  data: U,
  options: Omit<EnhancedFetchOptions, 'method' | 'body'> = {}
): Promise<ActionState<T>> {
  return sendJsonRequest<T, U>(url, 'POST', data, options);
}

/**
 * Convenience function for PUT requests
 */
export async function putJson<T = any, U = any>(
  url: string,
  data: U,
  options: Omit<EnhancedFetchOptions, 'method' | 'body'> = {}
): Promise<ActionState<T>> {
  return sendJsonRequest<T, U>(url, 'PUT', data, options);
}

/**
 * Convenience function for DELETE requests
 */
export async function deleteJson<T = any>(
  url: string,
  options: Omit<EnhancedFetchOptions, 'method'> = {}
): Promise<ActionState<T>> {
  return sendJsonRequest<T>(url, 'DELETE', undefined, options);
}

/**
 * Convenience function for PATCH requests
 */
export async function patchJson<T = any, U = any>(
  url: string,
  data: U,
  options: Omit<EnhancedFetchOptions, 'method' | 'body'> = {}
): Promise<ActionState<T>> {
  return sendJsonRequest<T, U>(url, 'PATCH', data, options);
}
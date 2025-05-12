/**
 * API Error Handling Utilities
 * 
 * Standardizes error handling across different API clients
 * with consistent error types, logging, and response formatting.
 */

import { ActionState } from "@/types";
import { 
  handleApiError, 
  updateJobToFailed 
} from "@/lib/jobs/job-helpers";
import { ApiType } from "@/types/session-types";

/**
 * Common error types used across API clients
 */
export enum ApiErrorType {
  // Network/Transport errors
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  
  // Authorization/authentication errors
  AUTH_ERROR = "AUTH_ERROR",
  API_KEY_ERROR = "API_KEY_ERROR",
  
  // Rate limiting/capacity errors
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  CAPACITY_ERROR = "CAPACITY_ERROR",
  
  // Input errors
  INVALID_REQUEST = "INVALID_REQUEST",
  CONTENT_FILTERED = "CONTENT_FILTERED",
  CONTENT_BLOCKED = "CONTENT_BLOCKED",
  
  // Service errors
  SERVER_ERROR = "SERVER_ERROR",
  UNAVAILABLE = "UNAVAILABLE",
  
  // Response handling errors
  RESPONSE_FORMAT_ERROR = "RESPONSE_FORMAT_ERROR",
  PARSING_ERROR = "PARSING_ERROR",
  EMPTY_RESPONSE = "EMPTY_RESPONSE",
  
  // Background job errors
  JOB_CREATION_ERROR = "JOB_CREATION_ERROR",
  JOB_UPDATE_ERROR = "JOB_UPDATE_ERROR",
  
  // Generic errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
  SDK_ERROR = "SDK_ERROR",
  RUNTIME_ERROR = "RUNTIME_ERROR"
}

/**
 * Maps HTTP status codes to standardized error types
 */
export function mapStatusCodeToErrorType(statusCode: number): ApiErrorType {
  if (statusCode >= 500) return ApiErrorType.SERVER_ERROR;
  
  switch (statusCode) {
    case 400: return ApiErrorType.INVALID_REQUEST;
    case 401: return ApiErrorType.AUTH_ERROR;
    case 403: return ApiErrorType.API_KEY_ERROR;
    case 404: return ApiErrorType.INVALID_REQUEST;
    case 408: return ApiErrorType.TIMEOUT_ERROR;
    case 429: return ApiErrorType.RATE_LIMIT_ERROR;
    default: return ApiErrorType.UNKNOWN_ERROR;
  }
}

/**
 * Error parser that attempts to extract meaning from various API error formats
 */
export function parseApiErrorResponse(
  error: unknown, 
  response?: Response
): { message: string; type: ApiErrorType; statusCode: number } {
  let message = '';
  let type = ApiErrorType.UNKNOWN_ERROR;
  let statusCode = response?.status || 0;
  
  // Handle Error objects
  if (error instanceof Error) {
    message = error.message;
    
    // Parse error types from error message
    if (message.includes('timed out') || message.includes('timeout')) {
      type = ApiErrorType.TIMEOUT_ERROR;
    } else if (message.includes('network') || message.includes('ECONNREFUSED')) {
      type = ApiErrorType.NETWORK_ERROR;
    } else if (message.includes('rate limit') || message.includes('429')) {
      type = ApiErrorType.RATE_LIMIT_ERROR;
    } else if (response?.status === 429) {
      type = ApiErrorType.RATE_LIMIT_ERROR;
    } else if (message.includes('invalid') && message.includes('key')) {
      type = ApiErrorType.API_KEY_ERROR;
    } else if (message.includes('content filtered') || message.includes('blocked')) {
      type = ApiErrorType.CONTENT_FILTERED;
    } else if (message.includes('status code')) {
      // Try to extract status code from error message
      const statusMatch = message.match(/status code (\d+)/i);
      if (statusMatch && statusMatch[1]) {
        statusCode = parseInt(statusMatch[1], 10);
        type = mapStatusCodeToErrorType(statusCode);
      }
    }
  } 
  // Handle JSON error responses
  else if (typeof error === 'object' && error !== null) {
    const errorObj = error as any;
    
    if (errorObj.error) {
      // Handle nested error objects
      if (typeof errorObj.error === 'object') {
        message = errorObj.error.message || errorObj.error.description || JSON.stringify(errorObj.error);
        // Try to use error type if provided
        if (errorObj.error.type) {
          if (errorObj.error.type.includes('rate_limit')) {
            type = ApiErrorType.RATE_LIMIT_ERROR;
          } else if (errorObj.error.type.includes('invalid_request')) {
            type = ApiErrorType.INVALID_REQUEST;
          } else if (errorObj.error.type.includes('authentication')) {
            type = ApiErrorType.AUTH_ERROR;
          }
        }
      } else {
        // Handle string error value
        message = String(errorObj.error);
      }
    } else if (errorObj.message) {
      // Use message field if present
      message = errorObj.message;
    } else {
      // Fallback to stringifying the entire object
      message = JSON.stringify(errorObj).substring(0, 200);
    }
    
    // Use status code to determine error type if available
    if (errorObj.status || response?.status) {
      statusCode = errorObj.status || response?.status || 0;
      type = mapStatusCodeToErrorType(statusCode);
    }
  } 
  // Handle string errors
  else if (typeof error === 'string') {
    message = error;
  } 
  // Handle all other errors
  else {
    message = String(error);
  }
  
  return { message, type, statusCode };
}

/**
 * Handle API errors with consistent logging and background job updates
 */
export async function handleApiClientError(
  error: unknown,
  options: {
    jobId?: string;
    apiType?: ApiType;
    logPrefix?: string;
    response?: Response;
  } = {}
): Promise<ActionState<string>> {
  const { jobId, apiType = 'gemini', logPrefix = '[API Client]' } = options;
  
  // Parse the error information
  const { message, type, statusCode } = parseApiErrorResponse(error, options.response);
  
  // Determine if this is a retryable error
  const isRetryable = [
    ApiErrorType.NETWORK_ERROR,
    ApiErrorType.TIMEOUT_ERROR,
    ApiErrorType.RATE_LIMIT_ERROR,
    ApiErrorType.CAPACITY_ERROR,
    ApiErrorType.SERVER_ERROR,
    ApiErrorType.UNAVAILABLE
  ].includes(type);
  
  // Log the error with consistent format
  console.error(`${logPrefix} Error (${type}): ${message}${statusCode ? ` [Status: ${statusCode}]` : ''}`);
  
  // Update job status if a job ID was provided
  if (jobId) {
    if (type === ApiErrorType.CONTENT_FILTERED || type === ApiErrorType.CONTENT_BLOCKED) {
      // For content filtering, use a more specific message
      await updateJobToFailed(jobId, `Content filtered: ${message}`);
    } else {
      await handleApiError(jobId, statusCode, message, apiType);
    }
  }
  
  // Return a standardized error response
  return {
    isSuccess: false,
    message: message,
    error: error instanceof Error ? error : new Error(message),
    metadata: {
      errorType: type,
      statusCode,
      isRetryable,
      ...(jobId ? { jobId } : {})
    }
  };
}

/**
 * Creates a standardized success response
 */
export function createApiSuccessResponse<T>(
  data: T,
  options: {
    message?: string;
    jobId?: string;
    modelInfo?: {
      modelUsed?: string;
      maxOutputTokens?: number;
      temperature?: number;
    };
    tokenInfo?: {
      tokensSent?: number;
      tokensReceived?: number;
      totalTokens?: number;
    };
    isBackgroundJob?: boolean;
    [key: string]: any;
  } = {}
): ActionState<T> {
  const { 
    message = "API request processed successfully",
    jobId,
    modelInfo = {},
    tokenInfo = {},
    isBackgroundJob,
    ...otherMetadata 
  } = options;
  
  return {
    isSuccess: true,
    message,
    data,
    metadata: {
      ...(jobId ? { jobId } : {}),
      ...(isBackgroundJob ? { isBackgroundJob } : {}),
      ...(modelInfo.modelUsed ? { modelUsed: modelInfo.modelUsed } : {}),
      ...(modelInfo.maxOutputTokens ? { maxOutputTokens: modelInfo.maxOutputTokens } : {}),
      ...(modelInfo.temperature !== undefined ? { temperature: modelInfo.temperature } : {}),
      ...(tokenInfo.tokensSent ? { tokensSent: tokenInfo.tokensSent } : {}),
      ...(tokenInfo.tokensReceived ? { tokensReceived: tokenInfo.tokensReceived } : {}),
      ...(tokenInfo.totalTokens ? { totalTokens: tokenInfo.totalTokens } : {}),
      ...otherMetadata
    }
  };
}
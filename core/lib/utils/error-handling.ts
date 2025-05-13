/**
 * Utility functions for error handling and retry logic
 */

import { ActionState } from "../../types/action-types";

/**
 * Standard error types used across the application
 */
export enum ErrorType {
  NETWORK_ERROR = "NETWORK_ERROR",
  TIMEOUT_ERROR = "TIMEOUT_ERROR",
  API_ERROR = "API_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  PERMISSION_ERROR = "PERMISSION_ERROR",
  NOT_FOUND_ERROR = "NOT_FOUND_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Extended Error class with additional properties for better error handling
 */
export class AppError extends Error {
  type: ErrorType;
  statusCode?: number;
  metadata?: Record<string, any>;
  
  constructor(message: string, type: ErrorType = ErrorType.UNKNOWN_ERROR, options: { 
    statusCode?: number;
    metadata?: Record<string, any>;
    cause?: Error;
  } = {}) {
    super(message);
    this.name = "AppError";
    this.type = type;
    this.statusCode = options.statusCode;
    this.metadata = options.metadata;
    
    // Capture original stack trace if available
    if (options.cause && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

/**
 * Helper to create a standardized error object
 */
export function createError(
  message: string,
  type: ErrorType = ErrorType.UNKNOWN_ERROR,
  options: {
    statusCode?: number;
    metadata?: Record<string, any>;
    cause?: Error;
  } = {}
): AppError {
  return new AppError(message, type, options);
}

/**
 * Helper to create a standardized error state for actions
 */
export function createErrorState<T>(
  error: Error | string,
  metadata?: Record<string, any>
): ActionState<T> {
  const message = typeof error === "string" ? error : error.message;
  const errorObj = typeof error === "string" ? new Error(error) : error;
  
  return {
    isSuccess: false,
    message,
    error: errorObj,
    metadata
  };
}

/**
 * Helper to create a standardized success state for actions
 */
export function createSuccessState<T>(
  data: T,
  message?: string,
  metadata?: Record<string, any>
): ActionState<T> {
  return {
    isSuccess: true,
    data,
    message,
    metadata
  };
}

/**
 * Determines if an error should be retried based on its nature and status code
 * @param error The error to check
 * @returns Boolean indicating if the error is retryable
 */
export function isRetryableError(error: any): boolean {
  // AppError handling
  if (error instanceof AppError) {
    if (error.type === ErrorType.NETWORK_ERROR || error.type === ErrorType.TIMEOUT_ERROR) {
      return true;
    }
    
    if (error.statusCode) {
      return [429, 502, 503, 504].includes(error.statusCode);
    }
  }
  
  // Network errors are generally retryable
  if (error?.name === 'NetworkError' || 
      error?.message?.includes('network') ||
      error?.message?.includes('ECONNRESET') ||
      error?.message?.includes('ETIMEDOUT')) {
    return true;
  }

  // Check for rate limiting or service unavailable errors
  const statusCode = error?.status || error?.statusCode;
  if (statusCode) {
    // 429: Too Many Requests, 503: Service Unavailable, 502: Bad Gateway
    return [429, 502, 503, 504].includes(statusCode);
  }

  return false;
}

/**
 * Calculates a delay for retry attempts with exponential backoff
 * @param attempt The current attempt number (1-based)
 * @param options Configuration options
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(
  attempt: number, 
  options: { 
    baseDelay?: number;
    maxDelay?: number;
    jitter?: boolean;
  } = {}
): number {
  const { 
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true
  } = options;

  // Exponential backoff: 2^attempt * baseDelay
  let delay = Math.min(
    Math.pow(2, attempt) * baseDelay,
    maxDelay
  );

  // Add jitter to prevent thundering herd problem
  if (jitter) {
    const jitterFactor = 0.25; // 25% jitter
    const randomJitter = Math.random() * jitterFactor * delay;
    delay = delay + randomJitter;
  }

  return delay;
}

/**
 * Safely extracts an error message from any error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError || error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return 'An unknown error occurred';
}

/**
 * Creates a UI-friendly display message for transcription errors
 * Moved from text-processing-utils.ts for better organization
 */
export function createTranscriptionErrorMessage(error: any): string {
  if (!error) {
    return 'Unknown error occurred during transcription';
  }

  if (typeof error === 'string') {
    // If it's a foreign key error, provide more helpful message
    if (error.includes('FOREIGN KEY constraint failed')) {
      return 'Session validation error. Please try again or create a new session.';
    }

    // If it mentions permission, provide more helpful message
    if (error.toLowerCase().includes('permission')) {
      return 'Microphone access was denied. Please allow microphone access and try again.';
    }

    // For network-related errors
    if (error.toLowerCase().includes('network') ||
        error.toLowerCase().includes('connect') ||
        error.toLowerCase().includes('offline')) {
      return 'Network error during voice processing. Please check your internet connection and try again.';
    }

    // For timeout errors
    if (error.toLowerCase().includes('timeout') ||
        error.toLowerCase().includes('timed out')) {
      return 'Voice processing timed out. Please try a shorter recording or try again later.';
    }

    // Return the string directly if it's already a string
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object') {
    // Try to extract error message from common error object formats
    if (error.message && typeof error.message === 'string') {
      return error.message;
    }

    if (error.error && typeof error.error === 'string') {
      return error.error;
    }

    if (error.reason && typeof error.reason === 'string') {
      return error.reason;
    }

    // Final fallback - stringify the object
    try {
      return JSON.stringify(error);
    } catch (e) {
      return 'Unknown error format';
    }
  }

  // Default fallback message
  return 'Error during voice transcription. Please try again.';
}

/**
 * Safely logs errors with standardized format
 */
export function logError(
  error: unknown, 
  context: string = '', 
  metadata: Record<string, any> = {}
): void {
  const errorMessage = getErrorMessage(error);
  const errorType = error instanceof AppError ? error.type : 'UNKNOWN';
  
  console.error(`[${context}] [${errorType}] ${errorMessage}`, {
    error,
    metadata,
    timestamp: new Date().toISOString()
  });
}

/**
 * Wraps an async function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    retryCondition?: (error: any) => boolean;
    onRetry?: (error: any, attempt: number, delay: number) => void;
    baseDelay?: number;
    maxDelay?: number;
    jitter?: boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    retryCondition = isRetryableError,
    onRetry = () => {},
    baseDelay = 1000,
    maxDelay = 30000,
    jitter = true
  } = options;
  
  let attempt = 0;
  
  while (true) {
    attempt++;
    
    try {
      return await fn();
    } catch (error) {
      // Don't retry if we've reached max attempts or if the error isn't retryable
      if (attempt >= maxAttempts || !retryCondition(error)) {
        throw error;
      }
      
      // Calculate delay for next attempt
      const delay = calculateRetryDelay(attempt, { baseDelay, maxDelay, jitter });
      
      // Notify of retry
      onRetry(error, attempt, delay);
      
      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
/**
 * Utility functions for error handling and retry logic
 */

import { type ActionState } from "@/types";

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
  BILLING_ERROR = "BILLING_ERROR",
  CONFIGURATION_ERROR = "CONFIGURATION_ERROR",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}


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
  SERVICE_UNAVAILABLE: 503,
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
 * Extended Error class with additional properties for better error handling
 */
export class AppError extends Error {
  type: ErrorType;
  statusCode?: number;
  metadata?: Record<string, unknown>;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN_ERROR,
    options: {
      statusCode?: number;
      metadata?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
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
    metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>
): ActionState<T> {
  const message = typeof error === "string" ? error : error.message;
  const errorObj = typeof error === "string" ? new Error(error) : error;

  return {
    isSuccess: false,
    message,
    error: errorObj,
    metadata,
  };
}

/**
 * Helper to create a standardized success state for actions
 */
export function createSuccessState<T>(
  data: T,
  message?: string,
  metadata?: Record<string, unknown>
): ActionState<T> {
  return {
    isSuccess: true,
    data,
    message,
    metadata,
  };
}

/**
 * Determines if an error should be retried based on its nature and status code
 * @param error The error to check
 * @returns Boolean indicating if the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // AppError handling
  if (error instanceof AppError) {
    if (
      error.type === ErrorType.NETWORK_ERROR ||
      error.type === ErrorType.TIMEOUT_ERROR
    ) {
      return true;
    }

    if (error.statusCode) {
      return [429, 502, 503, 504].includes(error.statusCode);
    }
  }

  // Network errors are generally retryable
  if (
    typeof error === 'object' && 
    error !== null && 
    (
      (error as { name?: string })?.name === "NetworkError" ||
      (error as { message?: string })?.message?.includes("network") ||
      (error as { message?: string })?.message?.includes("ECONNRESET") ||
      (error as { message?: string })?.message?.includes("ETIMEDOUT")
    )
  ) {
    return true;
  }

  // Check for rate limiting or service unavailable errors
  const statusCode = typeof error === 'object' && error !== null ? 
    (error as { status?: number })?.status || (error as { statusCode?: number })?.statusCode : 
    undefined;
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
  const { baseDelay = 1000, maxDelay = 30000, jitter = true } = options;

  // Exponential backoff: 2^attempt * baseDelay
  let delay = Math.min(Math.pow(2, attempt) * baseDelay, maxDelay);

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
    // Handle case where error.message might be empty
    if (!error.message || error.message.trim() === "") {
      return error.name || "An error occurred.";
    }
    return error.message;
  }

  if (typeof error === "string") {
    // Attempt to parse string as JSON to extract structured error
    try {
      const parsed = JSON.parse(error);
      if (parsed && typeof parsed === "object") {
        // Check for message property and return if it's a non-empty string
        if (parsed.message && typeof parsed.message === "string" && parsed.message.trim()) {
          return parsed.message;
        }
        
        // If no useful message property, try to stringify the parsed object
        try {
          const stringified = JSON.stringify(parsed);
          if (stringified && stringified !== "{}" && stringified !== "") {
            return stringified;
          }
        } catch {
          // Fallback if stringification fails
        }
        
        // Final fallback for parsed JSON without useful content
        return "A structured error occurred";
      }
      // If JSON but not an object, fall back to original string
      return error;
    } catch {
      // Not JSON, check for common error patterns
      if (error.includes("FOREIGN KEY constraint failed")) {
        return "Database constraint error occurred";
      }
      return error;
    }
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    // Handle case where error.message might be empty
    if (!error.message || error.message.trim() === "") {
      // Try to stringify the object for more context
      try {
        const stringified = JSON.stringify(error);
        if (stringified === "{}" || stringified === "") {
          return "An object error occurred";
        }
        return stringified;
      } catch {
        return "An object error occurred";
      }
    }
    return error.message;
  }

  return "An unknown error occurred";
}

/**
 * Creates a UI-friendly display message for transcription errors
 * Moved from text-processing-utils.ts for better organization
 */
export function createTranscriptionErrorMessage(error: unknown): string {
  if (!error) {
    return "Unknown error occurred during transcription";
  }
  
  // Handle empty or whitespace-only error messages
  const errorMessage = getErrorMessage(error);
  if (!errorMessage.trim()) {
    return "Voice processing failed. Please try again.";
  }

  if (typeof error === "string") {
    // If it's a foreign key error, provide more helpful message
    if (error.includes("FOREIGN KEY constraint failed")) {
      return "Session validation error. Please try again or create a new session.";
    }

    // If it mentions permission, provide more helpful message
    if (error.toLowerCase().includes("permission")) {
      return "Microphone access was denied. Please allow microphone access and try again.";
    }

    // For network-related errors
    if (
      error.toLowerCase().includes("network") ||
      error.toLowerCase().includes("connect") ||
      error.toLowerCase().includes("offline")
    ) {
      return "Network error during voice processing. Please check your internet connection and try again.";
    }

    // For timeout errors
    if (
      error.toLowerCase().includes("timeout") ||
      error.toLowerCase().includes("timed out")
    ) {
      return "Voice processing timed out. Please try a shorter recording or try again later.";
    }

    // Return the string directly if it's already a string and not empty
    return errorMessage;
  }

  if (error instanceof Error) {
    return getErrorMessage(error);
  }

  if (typeof error === "object" && error !== null) {
    // Try to extract error message from common error object formats
    if ('message' in error && typeof (error as {message: unknown}).message === "string") {
      return (error as {message: string}).message;
    }

    if ('error' in error && typeof (error as {error: unknown}).error === "string") {
      return (error as {error: string}).error;
    }

    if ('reason' in error && typeof (error as {reason: unknown}).reason === "string") {
      return (error as {reason: string}).reason;
    }

    // Final fallback - stringify the object
    try {
      const stringifiedError = JSON.stringify(error);
      if (stringifiedError === "{}") {
        return "An unspecified object error occurred during transcription.";
      }
      return stringifiedError;
    } catch (_e) {
      return "Unknown error format";
    }
  }

  // Default fallback message
  return "Error during voice transcription. Please try again.";
}

/**
 * Safely logs errors with standardized format
 */
export async function logError(
  error: unknown,
  context: string = "",
  metadata: Record<string, unknown> = {}
): Promise<void> {
  // Error logging is disabled by default. This is a placeholder for future implementation.
  // In a production setting, this would send errors to a monitoring service.
  if (import.meta.env.DEV) {
    console.error(`[ERROR] ${context}:`, error, metadata);
    return;
  }

  const serverUrl = import.meta.env.VITE_MAIN_SERVER_BASE_URL;
  if (!serverUrl) {
    return;
  }

  try {
    await fetch(`${serverUrl}/api/error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: String(error), context, metadata }),
    });
  } catch (_e) {
    // Swallow errors in production logging to avoid recursive failures
  }
}

/**
 * Wraps an async function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    retryCondition?: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number, delay: number) => void;
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
    jitter = true,
  } = options;

  let attempt = 0;

  // Retry loop with explicit check for maxAttempts
  while (attempt < maxAttempts) {
    attempt++;

    try {
      return await fn();
    } catch (error) {
      // Don't retry if we've reached max attempts or if the error isn't retryable
      if (attempt >= maxAttempts || !retryCondition(error)) {
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateRetryDelay(attempt, {
        baseDelay,
        maxDelay,
        jitter,
      });

      // Notify of retry
      onRetry(error, attempt, delay);

      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never happen, but is required to make TypeScript happy
  throw new Error(
    "Max retry attempts reached without success or specific error."
  );
}

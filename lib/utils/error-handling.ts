/**
 * Utility functions for error handling and retry logic
 */

/**
 * Determines if an error should be retried based on its nature and status code
 * @param error The error to check
 * @returns Boolean indicating if the error is retryable
 */
export function isRetryableError(error: any): boolean {
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
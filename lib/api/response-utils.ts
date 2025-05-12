/**
 * API Response Utilities
 * 
 * Helper functions to safely handle API response data with proper type checking.
 */

// Type guard to check if the response is a background job
export function isBackgroundJob(response: any): response is { isBackgroundJob: true; jobId: string } {
  return (
    typeof response === 'object' && 
    response !== null && 
    response.isBackgroundJob === true && 
    typeof response.jobId === 'string'
  );
}

/**
 * Ensures that an API response is treated as a string
 * 
 * Handles both direct string responses and background job objects.
 * For background jobs, returns an empty string and prints a warning.
 * 
 * @param response - The API response to process
 * @param defaultValue - The default value to return if the response is a background job
 * @returns A string representation of the response
 */
export function ensureString(
  response: string | { isBackgroundJob: true; jobId: string },
  defaultValue: string = ""
): string {
  if (typeof response === 'string') {
    return response;
  }
  
  if (isBackgroundJob(response)) {
    console.warn(`Response is a background job with ID ${response.jobId}. Returning default value.`);
    return defaultValue;
  }
  
  // Fallback for unexpected response types
  return String(response) || defaultValue;
}

/**
 * Get a background job ID from an API response
 * 
 * @param response - The API response to extract the job ID from
 * @returns The job ID if present, or null if not a background job
 */
export function getJobId(
  response: string | { isBackgroundJob: true; jobId: string } | any
): string | null {
  if (isBackgroundJob(response)) {
    return response.jobId;
  }
  
  // Check if the response has metadata with a jobId
  if (
    typeof response === 'object' && 
    response !== null && 
    response.metadata && 
    typeof response.metadata.jobId === 'string'
  ) {
    return response.metadata.jobId;
  }
  
  return null;
}

// Attach the utilities to the global API namespace
if (typeof globalThis !== 'undefined') {
  (globalThis as any).API = {
    ensureString,
    isBackgroundJob,
    getJobId
  };
}
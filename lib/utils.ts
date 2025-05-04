import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { createHash } from "crypto";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A safe fetch wrapper that handles common network issues with retries,
 * timeouts, and proper error handling. It binds fetch to window in browser
 * environments to prevent "Illegal invocation" errors.
 * 
 * @param input URL or Request object to fetch
 * @param init Optional fetch options and retry configuration
 * @returns A Promise resolving to the Response
 */
export function safeFetch(
  input: RequestInfo | URL, 
  init?: RequestInit & { 
    retries?: number; 
    retryDelay?: number;
    timeout?: number;
  }
): Promise<Response> {
  const options = { ...init };
  const maxRetries = options.retries || 3;
  const retryDelay = options.retryDelay || 1000;
  const timeout = options.timeout || 30000;
  
  // Remove custom options to avoid fetch errors
  delete options.retries;
  delete options.retryDelay;
  delete options.timeout;
  
  // Create the actual fetch function based on environment
  const fetchFn = typeof window !== 'undefined' 
    ? window.fetch.bind(window) 
    : fetch;
  
  // Function to perform fetch with timeout
  const fetchWithTimeout = (url: RequestInfo | URL, opts?: RequestInit): Promise<Response> => {
    // Create abort controller for timeout
    const controller = new AbortController();
    const signal = controller.signal;
    
    // Merge existing signal with our controller
    const fetchOptions = { ...opts, signal };
    
    // Create the timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    return fetchFn(url, fetchOptions)
      .finally(() => clearTimeout(timeoutId));
  };
  
  // Recursive retry function
  const performFetchWithRetry = (
    retriesLeft: number,
    waitTime: number
  ): Promise<Response> => {
    return new Promise((resolve, reject) => {
      fetchWithTimeout(input, options)
        .then(response => {
          // If response is ok or we're out of retries, resolve with what we have
          if (response.ok || retriesLeft === 0) {
            resolve(response);
          } else if (retriesLeft > 0) {
            // Otherwise retry after the delay
            setTimeout(() => {
              performFetchWithRetry(retriesLeft - 1, waitTime * 1.5)
                .then(resolve)
                .catch(reject);
            }, waitTime);
          }
        })
        .catch(error => {
          // If we've run out of retries or it's a timeout/abort error, reject
          if (
            retriesLeft === 0 || 
            error.name === 'AbortError' || 
            (error instanceof TypeError && error.message.includes('Failed to fetch'))
          ) {
            reject(error);
          } else {
            // Otherwise retry
            setTimeout(() => {
              performFetchWithRetry(retriesLeft - 1, waitTime * 1.5)
                .then(resolve)
                .catch(reject);
            }, waitTime);
          }
        });
    });
  };
  
  return performFetchWithRetry(maxRetries, retryDelay);
}

/**
 * Helper function to strip common markdown code fences from the beginning and end of a string.
 * Handles variations like ```diff, ```patch, ```, etc.
 * @param content The string content potentially containing code fences.
 * @returns The content with leading/trailing fences removed.
 */
export function stripMarkdownCodeFences(content: string): string {
  // Match potential fences at the beginning or end, considering optional language identifiers and surrounding whitespace/newlines.
  // Regex handles ```, ```diff, ```patch, etc., at start and end.
  // Group 1 captures the actual content *between* the fences if both are present.
  // Group 2 captures content if only a start fence is present (multiline match needed).
  // Group 3 captures content if only an end fence is present (multiline match needed).
  // Handles optional language identifiers and surrounding whitespace/newlines.
  const fenceRegex = /^\s*```(?:[a-zA-Z0-9\-_]*)\s*?\r?\n([\s\S]*?)\r?\n\s*```\s*$|^\s*```(?:[a-zA-Z0-9\-_]*)\s*?\r?\n([\s\S]+)|([\s\S]+?)\r?\n\s*```\s*$/;

  const match = content.match(fenceRegex);

  if (match) {
    // Return the captured group that is not undefined, prioritizing the full match (group 1)
    return (match[1] ?? match[2] ?? match[3] ?? content).trim();
  }
  return content;
}
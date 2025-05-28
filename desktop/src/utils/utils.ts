import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A safe fetch wrapper that handles common network issues with retries,
 * timeouts, and proper error handling. It binds fetch to window in browser
 * environments to prevent "Illegal invocation" errors.
 *
 * This is the preferred utility for all fetch operations in the application.
 * Use this instead of the basic fetch API or enhancedFetch.
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
  const fetchFn =
    typeof window !== "undefined" ? window.fetch.bind(window) : fetch;

  // Function to perform fetch with timeout
  const fetchWithTimeout = (
    url: RequestInfo | URL,
    opts?: RequestInit
  ): Promise<Response> => {
    // Create abort controller for timeout
    const controller = new AbortController();
    const signal = controller.signal;

    // Merge existing signal with our controller
    const fetchOptions = { ...opts, signal };

    // Create the timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetchFn(url, fetchOptions).finally(() => clearTimeout(timeoutId));
  };

  // Recursive retry function
  const performFetchWithRetry = (
    retriesLeft: number,
    waitTime: number
  ): Promise<Response> => {
    return new Promise((resolve, reject) => {
      fetchWithTimeout(input, options)
        .then((response) => {
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
        .catch((error) => {
          if (retriesLeft === 0) {
            reject(new Error(`Fetch failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`));
          } else if (error && typeof error === 'object' && 'name' in error && error.name === "AbortError") {
            reject(new Error(`Fetch timed out after ${timeout}ms: ${input instanceof Request ? input.url : String(input)}`));
          } else if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
            reject(new Error(`Network error during fetch: ${error.message}`));
          } else {
            // Retry for other errors
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
 * Helper function to strip markdown code fences from XML content.
 * Prioritizes explicit ```xml fences, then generic fences containing XML-like content.
 * @param content The string content potentially containing code fences.
 * @returns The content with fences removed if they contain XML, otherwise original content.
 */
export function stripMarkdownCodeFences(content: string): string {
  const trimmed_content = content.trim();
  if (!trimmed_content) return "";

  const xmlFencePattern = /^\s*```xml\s*\r?\n([\s\S]*?)\r?\n\s*```\s*$/;
  const xmlMatch = trimmed_content.match(xmlFencePattern);
  if (xmlMatch && xmlMatch[1] !== undefined) {
    return xmlMatch[1].trim();
  }

  // Optional: If you still want to catch generic fences that happen to contain XML:
  const genericFencePattern = /^\s*```(?:[a-zA-Z0-9\-_]+)?\s*\r?\n([\s\S]*?)\r?\n\s*```\s*$/;
  const genericMatch = trimmed_content.match(genericFencePattern);
  if (genericMatch && genericMatch[1] !== undefined) {
    const innerContent = genericMatch[1].trim();
    // Only return if it looks like XML
    if (innerContent.startsWith("&lt;") || innerContent.startsWith("<")) { // Check for escaped or raw XML
      return innerContent;
    }
  }

  // If no specific XML or generic fence containing XML is found, return original trimmed content
  return trimmed_content;
}

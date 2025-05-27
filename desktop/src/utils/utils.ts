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
 * Helper function to strip common markdown code fences from the beginning and end of a string.
 * Handles variations like ```diff, ```patch, ```, etc.
 * @param content The string content potentially containing code fences.
 * @returns The content with leading/trailing fences removed.
 */
export function stripMarkdownCodeFences(content: string): string {
  // Regex to find content between the outermost triple backticks,
  // allowing for an optional language specifier after the opening fence.
  // It uses a non-greedy match for the content.
  const fenceRegex = /^\s*```(?:[a-zA-Z0-9\-_]+)?\s*\r?\n([\s\S]*?)\r?\n\s*```\s*$/;
  const match = content.match(fenceRegex);

  if (match && match[1] !== undefined) {
    return match[1].trim(); // Return the captured content
  }

  // Fallback for cases where only one fence might be present or formatting is unusual
  // This tries to remove leading/trailing fences more loosely.
  let processedContent = content.trim();
  const startsWithFence = /^\s*```(?:[a-zA-Z0-9\-_]+)?\s*\r?\n/.test(processedContent);
  const endsWithFence = /\r?\n\s*```\s*$/.test(processedContent);

  if (startsWithFence) {
    processedContent = processedContent.replace(/^\s*```(?:[a-zA-Z0-9\-_]+)?\s*\r?\n/, "");
  }
  if (endsWithFence) {
    processedContent = processedContent.replace(/\r?\n\s*```\s*$/, "");
  }

  // Only return the processed content if fences were actually removed,
  // otherwise return original if no clear outer fences were found.
  // This check prevents accidental stripping if the content itself contains "```".
  if (startsWithFence || endsWithFence) {
    return processedContent.trim();
  }

  return content; // Return original content if no clear outer fences are matched
}

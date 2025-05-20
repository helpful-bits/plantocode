/**
 * Utility for tracking fetch requests throughout the application
 * Works in both browser and Node.js environments
 */

// Custom logger to replace console calls
const logger = {
  // Default to no logging in production
  isEnabled: import.meta.env.DEV,
  
  log: (...args: unknown[]): void => {
    if (logger.isEnabled) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  },
  
  error: (...args: unknown[]): void => {
    if (logger.isEnabled) {
      // eslint-disable-next-line no-console
      console.error(...args);
    }
  },
  
  trace: (...args: unknown[]): void => {
    if (logger.isEnabled) {
      // eslint-disable-next-line no-console
      console.trace(...args);
    }
  }
};

// Generate a unique ID for tracking requests
const generateId = (): string => {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
};

// Check if we're in a browser environment
const isBrowser =
  typeof window !== "undefined" && typeof window.fetch !== "undefined";

// Helper to get stack trace - function is used internally by the logger
function getDebugInfo(): { stack: string; timestamp: string } {
  const timestamp = new Date().toISOString();
  
  let stack = "";
  try {
    // Create an error to capture the stack trace
    const err = new Error();
    stack = err.stack || "";
  } catch (_) {
    // Ignore errors when capturing stack trace
  }
  
  return { stack, timestamp };
}

// TrackedFetch class to intercept and track fetch requests
export class TrackedFetch {
  private originalFetch: typeof fetch;
  private requestsInProgress = new Map<
    string,
    { url: string; startTime: number; method: string }
  >();
  private onRequestStart?: (id: string, url: string, method: string) => void;
  private onRequestComplete?: (
    id: string,
    url: string,
    success: boolean,
    duration: number
  ) => void;

  constructor() {
    // Set the appropriate fetch based on environment
    this.originalFetch = isBrowser ? window.fetch.bind(window) : fetch;
  }

  /**
   * Set up fetch interceptor
   */
  public setupInterceptor(
    onRequestStart?: (id: string, url: string, method: string) => void,
    onRequestComplete?: (
      id: string,
      url: string,
      success: boolean,
      duration: number
    ) => void
  ): void {
    this.onRequestStart = onRequestStart;
    this.onRequestComplete = onRequestComplete;

    // In browser, we can override the global fetch
    if (isBrowser) {
      window.fetch = this.handleFetch.bind(this);
    }
    // In Node.js, we can't override global fetch, so setupInterceptor just sets up callbacks
  }

  /**
   * Restore original fetch implementation (browser only)
   */
  public restore(): void {
    if (isBrowser) {
      window.fetch = this.originalFetch;
    }
  }

  /**
   * Handle fetch requests - used internally in browser, exposed for Node.js
   */
  public async fetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    return this.handleFetch(input, init);
  }

  /**
   * Internal method to handle fetch requests
   */
  private async handleFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // Skip tracking for empty URLs
    if (!input) {
      return this.originalFetch(input, init);
    }

    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || "GET";
    const requestId = generateId();
    const startTime = Date.now();

    // Record request start
    this.requestsInProgress.set(requestId, { url, startTime, method });

    // Enhanced logging - especially for POST requests or specific endpoints
    const isPostRequest = method === "POST";
    const isRootPath = url === "/" || url.startsWith("/api/");

    if (isPostRequest || isRootPath) {
      // Get debug info if needed for detailed logging
      const debug = import.meta.env.VITE_DEBUG_FETCH === "true" ? getDebugInfo() : null;

      // Logging request information
      logger.log(
        `[TrackedFetch] ${method} request to ${url} (ID: ${requestId})`
      );

      if (isPostRequest) {
        // Log POST request details
        logger.log(`[TrackedFetch] POST request details:
  - URL: ${url}
  - Body size: ${init?.body ? (typeof init.body === "string" ? init.body.length : "[Unknown]") : "none"}`);

        if (isRootPath) {
          // Log warning for root/API path POST request
          logger.log(
            `[TrackedFetch] WARNING: POST request to root or API path detected`
          );
          // Log additional debug info for root/API path POST request
          if (debug) {
            logger.trace(`[TrackedFetch] Debug info for POST to ${url} (${debug.timestamp})`);
          }
        }
      }
    }

    if (this.onRequestStart) {
      this.onRequestStart(requestId, url, method);
    }

    try {
      // Make the actual fetch request
      const response = await this.originalFetch(input, init);
      const duration = Date.now() - startTime;

      // Record request completion
      this.requestsInProgress.delete(requestId);

      // Enhanced logging for completed requests, especially for targeted URLs
      if (isPostRequest || isRootPath) {
        // Log completed request status
        logger.log(
          `[TrackedFetch] Completed ${method} request to ${url} in ${duration}ms (ID: ${requestId}), Status: ${response.status}`
        );
      }

      if (this.onRequestComplete) {
        this.onRequestComplete(requestId, url, response.ok, duration);
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Record request failure
      this.requestsInProgress.delete(requestId);

      // Enhanced error logging for failed requests
      // Log failed request error
      logger.error(
        `[TrackedFetch] Failed ${method} request to ${url} after ${duration}ms (ID: ${requestId})`,
        error
      );

      if (isPostRequest || isRootPath) {
        // Log additional debug info for failed request
        const debug = getDebugInfo();
        logger.trace(
          `[TrackedFetch] Error details for failed request to ${url} (${debug.timestamp})`
        );
      }

      if (this.onRequestComplete) {
        this.onRequestComplete(requestId, url, false, duration);
      }

      throw error;
    }
  }

  /**
   * Get all in-progress requests
   */
  public getInProgressRequests(): Array<{
    id: string;
    url: string;
    startTime: number;
    method: string;
  }> {
    return Array.from(this.requestsInProgress.entries()).map(([id, data]) => ({
      id,
      ...data,
    }));
  }

  /**
   * Check if there are any requests in progress
   */
  public hasRequestsInProgress(): boolean {
    return this.requestsInProgress.size > 0;
  }
}

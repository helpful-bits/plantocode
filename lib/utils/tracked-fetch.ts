/**
 * Utility for tracking fetch requests throughout the application
 */

// Generate a unique ID for tracking requests
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

// TrackedFetch class to intercept and track fetch requests
export class TrackedFetch {
  private originalFetch: typeof fetch;
  private requestsInProgress = new Map<string, { url: string, startTime: number, method: string }>();
  private onRequestStart?: (id: string, url: string, method: string) => void;
  private onRequestComplete?: (id: string, url: string, success: boolean, duration: number) => void;
  
  constructor() {
    this.originalFetch = window.fetch;
  }

  /**
   * Set up fetch interceptor
   */
  public setupInterceptor(
    onRequestStart?: (id: string, url: string, method: string) => void,
    onRequestComplete?: (id: string, url: string, success: boolean, duration: number) => void
  ): void {
    this.onRequestStart = onRequestStart;
    this.onRequestComplete = onRequestComplete;
    
    window.fetch = this.handleFetch.bind(this);
  }

  /**
   * Restore original fetch implementation
   */
  public restore(): void {
    window.fetch = this.originalFetch;
  }

  /**
   * Handle fetch requests
   */
  private async handleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // Skip tracking for empty URLs
    if (!input) {
      return this.originalFetch(input, init);
    }

    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const requestId = generateId();
    const startTime = performance.now();
    
    // Record request start
    this.requestsInProgress.set(requestId, { url, startTime, method });
    
    if (this.onRequestStart) {
      this.onRequestStart(requestId, url, method);
    }

    try {
      // Make the actual fetch request
      const response = await this.originalFetch(input, init);
      const duration = performance.now() - startTime;
      
      // Record request completion
      this.requestsInProgress.delete(requestId);
      
      if (this.onRequestComplete) {
        this.onRequestComplete(requestId, url, response.ok, duration);
      }
      
      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      // Record request failure
      this.requestsInProgress.delete(requestId);
      
      if (this.onRequestComplete) {
        this.onRequestComplete(requestId, url, false, duration);
      }
      
      throw error;
    }
  }

  /**
   * Get all in-progress requests
   */
  public getInProgressRequests(): Array<{ id: string, url: string, startTime: number, method: string }> {
    return Array.from(this.requestsInProgress.entries()).map(([id, data]) => ({
      id,
      ...data
    }));
  }

  /**
   * Check if there are any requests in progress
   */
  public hasRequestsInProgress(): boolean {
    return this.requestsInProgress.size > 0;
  }
} 
/**
 * Utility for tracking fetch requests in Node.js environment
 */

import { fetch as nodeFetch } from '@whatwg-fetch';
import type { RequestInfo, RequestInit, Response } from '@whatwg-fetch';

// Generate a unique ID for tracking requests
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

// TrackedFetch class to intercept and track fetch requests in Node.js
export class TrackedFetch {
  private originalFetch: typeof nodeFetch;
  private requestsInProgress = new Map<string, { url: string, startTime: number, method: string }>();
  private onRequestStart?: (id: string, url: string, method: string) => void;
  private onRequestComplete?: (id: string, url: string, success: boolean, duration: number) => void;
  
  constructor() {
    this.originalFetch = nodeFetch;
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
    
    // In Node.js we can't override global fetch, so we provide a tracked version
  }

  /**
   * Tracked fetch method for Node.js
   */
  public async fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    // Skip tracking for empty URLs
    if (!input) {
      return this.originalFetch(input, init);
    }

    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method || 'GET';
    const requestId = generateId();
    const startTime = Date.now();
    
    // Record request start
    this.requestsInProgress.set(requestId, { url, startTime, method });
    
    if (this.onRequestStart) {
      this.onRequestStart(requestId, url, method);
    }

    try {
      // Make the actual fetch request
      const response = await this.originalFetch(input, init);
      const duration = Date.now() - startTime;
      
      // Record request completion
      this.requestsInProgress.delete(requestId);
      
      if (this.onRequestComplete) {
        this.onRequestComplete(requestId, url, response.ok, duration);
      }
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
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
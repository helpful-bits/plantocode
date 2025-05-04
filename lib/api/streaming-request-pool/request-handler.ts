import { RequestType, RequestInfo, FetchOptions, Response, ActiveRequest } from '../streaming-request-pool-types';
import { safeFetch } from '@/lib/utils';

/**
 * Handler for managing active requests and their execution
 */
export class RequestHandler {
  // Tracking active requests with their abort controllers
  private activeRequests: Map<string, ActiveRequest> = new Map();
  
  // Counters for active requests
  private activeGlobal: number = 0;
  private activeSessions: Map<string, number> = new Map();
  private activeByType: Map<RequestType, number> = new Map();
  
  // Concurrent request limits
  private maxConcurrentGlobal: number = 10;
  private maxConcurrentPerSession: number = 5;
  private maxConcurrentPerType: Map<RequestType, number> = new Map([
    [RequestType.GEMINI_CHAT, 3],
    [RequestType.CODE_ANALYSIS, 2],
    [RequestType.GENERAL, 5],
    [RequestType.FILE_OPERATION, 3],
    [RequestType.CLAUDE_REQUEST, 2],
    [RequestType.WHISPER_REQUEST, 2],
    [RequestType.VOICE_TRANSCRIPTION, 2],
    [RequestType.PROCESSING, 5]
  ]);
  
  constructor() {
    // Initialize active counts for each request type
    Object.values(RequestType).forEach(type => {
      this.activeByType.set(type, 0);
    });
  }
  
  /**
   * Check if there's capacity to run another request
   */
  public hasCapacity(sessionId: string, requestType: RequestType): boolean {
    // Check global capacity
    if (this.activeGlobal >= this.maxConcurrentGlobal) {
      return false;
    }
    
    // Check per-session capacity
    const sessionActive = this.activeSessions.get(sessionId) || 0;
    if (sessionActive >= this.maxConcurrentPerSession) {
      return false;
    }
    
    // Check per-type capacity
    const typeActive = this.activeByType.get(requestType) || 0;
    const typeLimit = this.maxConcurrentPerType.get(requestType) || 1;
    if (typeActive >= typeLimit) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Run a request and update tracking counters
   */
  public async runRequest<T>(
    requestFn: () => Promise<T>,
    sessionId: string,
    requestType: RequestType,
    requestId?: string
  ): Promise<T> {
    // Increment counters
    this.activeGlobal++;
    
    // Increment session counter
    const sessionActive = this.activeSessions.get(sessionId) || 0;
    this.activeSessions.set(sessionId, sessionActive + 1);
    
    // Increment request type counter
    const typeActive = this.activeByType.get(requestType) || 0;
    this.activeByType.set(requestType, typeActive + 1);
    
    console.log(`[Streaming Pool] Running ${requestType} request${requestId ? ` (${requestId})` : ''} for session ${sessionId}. Active global: ${this.activeGlobal}, session active: ${sessionActive + 1}, type active: ${typeActive + 1}`);
    
    try {
      // Execute the actual request
      return await requestFn();
    } finally {
      // Clean up any remaining abort controller for this request
      if (requestId && this.activeRequests.has(requestId)) {
        this.activeRequests.delete(requestId);
      }
      
      // Decrement counters when request completes (regardless of success/failure)
      this.activeGlobal--;
      
      // Decrement session counter
      const currentSessionActive = this.activeSessions.get(sessionId) || 1;
      this.activeSessions.set(sessionId, currentSessionActive - 1);
      
      // Decrement request type counter
      const currentTypeActive = this.activeByType.get(requestType) || 1;
      this.activeByType.set(requestType, currentTypeActive - 1);
    }
  }
  
  /**
   * Perform fetch with abort controller tracking
   */
  public async fetch(
    id: string, 
    url: RequestInfo, 
    options: FetchOptions = {},
    sessionId: string = 'unknown',
    requestType: RequestType = RequestType.GENERAL
  ): Promise<Response> {
    // Create an abort controller for this request
    const controller = new AbortController();
    
    // Register the active request
    this.activeRequests.set(id, { 
      controller, 
      createdAt: Date.now(),
      sessionId,
      requestType
    });
    
    // Add the signal to the options
    const fetchOptions = {
      ...options,
      signal: controller.signal
    };
    
    try {
      // Perform the fetch with the abort signal
      const response = await safeFetch(url, fetchOptions);
      
      // Request completed successfully, clean up controller
      this.activeRequests.delete(id);
      
      return response;
    } catch (error) {
      // Clean up controller on error
      this.activeRequests.delete(id);
      
      // Re-throw the error
      throw error;
    }
  }
  
  /**
   * Cancel a specific request by its ID
   */
  public cancelRequest(id: string, reason = 'User canceled'): boolean {
    const request = this.activeRequests.get(id);
    if (request) {
      // Set cancel reason for tracking
      request.cancelReason = reason;
      
      // Abort the request
      request.controller.abort(reason);
      
      // Remove from active requests
      this.activeRequests.delete(id);
      
      return true;
    }
    return false;
  }
  
  /**
   * Cancel all active requests for a specific session
   */
  public cancelSessionRequests(sessionId: string, reason = 'Session requests canceled'): number {
    let cancelCount = 0;
    
    for (const [id, request] of this.activeRequests.entries()) {
      if (request.sessionId === sessionId) {
        request.cancelReason = reason;
        request.controller.abort(reason);
        this.activeRequests.delete(id);
        cancelCount++;
      }
    }
    
    return cancelCount;
  }
  
  /**
   * Cancel all active requests
   */
  public cancelAll(reason = 'All requests canceled'): number {
    let cancelCount = 0;
    
    for (const [id, request] of this.activeRequests.entries()) {
      request.cancelReason = reason;
      request.controller.abort(reason);
      cancelCount++;
    }
    
    this.activeRequests.clear();
    
    return cancelCount;
  }
  
  /**
   * Check if a request is active
   */
  public isActive(id: string): boolean {
    return this.activeRequests.has(id);
  }
  
  /**
   * Check if a request was cancelled
   */
  public isCancelled(id: string): boolean {
    const request = this.activeRequests.get(id);
    return request ? !!request.cancelReason : false;
  }
  
  /**
   * Get the number of active requests
   */
  public getActiveCount(): number {
    return this.activeRequests.size;
  }
  
  /**
   * Get the active request IDs
   */
  public getActiveRequestIds(): string[] {
    return Array.from(this.activeRequests.keys());
  }
  
  /**
   * Get details about a specific request
   */
  public getRequestDetails(id: string): ActiveRequest | undefined {
    return this.activeRequests.get(id);
  }
  
  /**
   * Get current capacity limits
   */
  public getLimits() {
    return {
      global: this.maxConcurrentGlobal,
      perSession: this.maxConcurrentPerSession,
      perType: Object.fromEntries(this.maxConcurrentPerType.entries())
    };
  }
  
  /**
   * Get current active counts
   */
  public getActiveCounts() {
    return {
      global: this.activeGlobal,
      sessions: Object.fromEntries(this.activeSessions),
      types: Object.fromEntries(this.activeByType)
    };
  }
  
  /**
   * Update concurrent request limits
   */
  public updateLimits(
    newGlobalLimit?: number,
    newSessionLimit?: number,
    newTypeLimits?: Partial<Record<RequestType, number>>
  ): void {
    if (newGlobalLimit !== undefined && newGlobalLimit > 0) {
      this.maxConcurrentGlobal = newGlobalLimit;
    }
    
    if (newSessionLimit !== undefined && newSessionLimit > 0) {
      this.maxConcurrentPerSession = newSessionLimit;
    }
    
    if (newTypeLimits) {
      for (const [type, limit] of Object.entries(newTypeLimits)) {
        if (type in RequestType && limit > 0) {
          this.maxConcurrentPerType.set(type as RequestType, limit);
        }
      }
    }
  }
} 
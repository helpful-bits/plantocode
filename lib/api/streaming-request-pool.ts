import { 
  RequestType, 
  RequestInfo, 
  FetchOptions, 
  Response, 
  ExecuteOptions,
  PoolStats
} from './streaming-request-pool-types';
import { RequestQueue, QueuedRequest } from './streaming-request-pool/queue';
import { RequestHandler } from './streaming-request-pool/request-handler';
import { ActionState } from "@/types";

/**
 * Pool for managing concurrent streaming requests
 * 
 * This manages concurrent streaming requests to various APIs
 * without blocking or dropping requests
 */
class StreamingRequestPool {
  private requestQueue: RequestQueue;
  private requestHandler: RequestHandler;
  private processQueueInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.requestQueue = new RequestQueue();
    this.requestHandler = new RequestHandler();
    
    // Start processing the queue periodically
    this.startQueueProcessing();
  }
  
  /**
   * Execute a streaming request through the pool
   * @param requestFn Function that performs the actual request
   * @param options Object with request metadata including sessionId, requestId, etc.
   * @returns The result of the request function
   */
  async execute<T>(
    requestFn: () => Promise<ActionState<T>>,
    options: ExecuteOptions
  ): Promise<ActionState<T>> {
    const { 
      sessionId, 
      requestId, 
      requestType = RequestType.GENERAL, 
      priority = 1 
    } = options;
    
    // Special handling for file operations - they should have high priority
    let effectivePriority = priority;
    if (requestType === RequestType.FILE_OPERATION) {
      effectivePriority = 20; // Highest priority for file operations
    }
    
    // Check if we have capacity to run this request immediately
    if (this.requestHandler.hasCapacity(sessionId, requestType)) {
      return this.requestHandler.runRequest(requestFn, sessionId, requestType, requestId);
    } else {
      // No capacity, queue the request
      return new Promise<ActionState<T>>((resolve, reject) => {
        this.requestQueue.enqueue({
          requestFn,
          resolve,
          reject,
          sessionId,
          priority: effectivePriority,
          startTime: Date.now(),
          requestType,
          requestId
        });
        
        console.log(`[Streaming Pool] Queued ${requestType} request${requestId ? ` (${requestId})` : ''} for session ${sessionId}. Queue size: ${this.requestQueue.size()}`);
      });
    }
  }
  
  /**
   * Start processing the queue at regular intervals
   */
  private startQueueProcessing(): void {
    if (this.processQueueInterval) {
      clearInterval(this.processQueueInterval);
    }
    
    // Process the queue every 100ms
    this.processQueueInterval = setInterval(() => {
      this.processQueue();
    }, 100);
  }
  
  /**
   * Process the next request in the queue if capacity allows
   */
  private processQueue(): void {
    if (this.requestQueue.size() === 0) return;
    
    // Find the first request in the queue that we have capacity for
    const request = this.requestQueue.dequeue(
      (sessionId, requestType) => this.requestHandler.hasCapacity(sessionId, requestType)
    );
    
    if (request) {
      // Execute the request
      this.requestHandler.runRequest(
        request.requestFn,
        request.sessionId,
        request.requestType,
        request.requestId
      )
        .then(request.resolve)
        .catch(request.reject);
    }
  }
  
  /**
   * Cancel all queued session requests
   */
  cancelQueuedSessionRequests(sessionId: string): number {
    const removedRequests = this.requestQueue.removeSessionRequests(sessionId);
    
    // Reject all the removed requests
    for (const request of removedRequests) {
      request.reject(new Error(`Request cancelled: session ${sessionId} requests were cancelled`));
    }
    
    // Also cancel any active requests for this session
    const activeCancelled = this.requestHandler.cancelSessionRequests(
      sessionId, 
      `Session ${sessionId} requests cancelled`
    );
    
    const totalCancelled = removedRequests.length + activeCancelled;
    if (totalCancelled > 0) {
      console.log(`[Streaming Pool] Cancelled ${totalCancelled} requests for session ${sessionId}`);
    }
    
    return totalCancelled;
  }
  
  /**
   * Cancel a queued request by ID
   */
  cancelQueuedRequestsById(sessionId: string, requestId: string): number {
    let cancelledCount = 0;
    
    // Check if the request is in the queue
    const queuedRequest = this.requestQueue.getRequestById(requestId);
    if (queuedRequest) {
      // Only cancel if it belongs to the specified session
      if (queuedRequest.sessionId === sessionId) {
        const removed = this.requestQueue.remove(requestId);
        if (removed) {
          queuedRequest.reject(new Error(`Request ${requestId} cancelled by user`));
          cancelledCount++;
        }
      }
    }
    
    // Also check if it's an active request
    if (this.requestHandler.isActive(requestId)) {
      const cancelled = this.requestHandler.cancelRequest(requestId, `Request ${requestId} cancelled by user`);
      if (cancelled) {
        console.log(`[Streaming Pool] Cancelled active request ${requestId}`);
        cancelledCount++;
      }
    }
    
    return cancelledCount;
  }
  
  /**
   * Cancel all queued requests of a specific type
   */
  cancelQueuedRequestsByType(requestType: RequestType, sessionId?: string): number {
    const removedRequests = this.requestQueue.removeRequestsByType(requestType, sessionId);
    
    // Reject all the removed requests
    for (const request of removedRequests) {
      request.reject(new Error(`Request cancelled: ${requestType} requests were cancelled`));
    }
    
    console.log(`[Streaming Pool] Cancelled ${removedRequests.length} queued ${requestType} requests${sessionId ? ` for session ${sessionId}` : ''}`);
    
    return removedRequests.length;
  }
  
  /**
   * Perform a fetch request with abort capability
   */
  public async fetch(
    id: string, 
    url: RequestInfo, 
    options: FetchOptions = {},
    sessionId: string = 'unknown',
    requestType: RequestType = RequestType.GENERAL
  ): Promise<Response> {
    return this.requestHandler.fetch(id, url, options, sessionId, requestType);
  }
  
  /**
   * Cancel a request by ID
   */
  public cancelRequest(id: string, reason = 'User canceled'): boolean {
    return this.requestHandler.cancelRequest(id, reason);
  }
  
  /**
   * Cancel all requests
   */
  public cancelAll(reason = 'All requests canceled'): number {
    // Cancel all active requests
    const activeCancelled = this.requestHandler.cancelAll(reason);
    
    // Cancel all queued requests
    const queuedRequests = this.requestQueue.clear();
    for (const request of queuedRequests) {
      request.reject(new Error(`Request cancelled: ${reason}`));
    }
    
    const totalCancelled = activeCancelled + queuedRequests.length;
    if (totalCancelled > 0) {
      console.log(`[Streaming Pool] Cancelled ${totalCancelled} requests (${activeCancelled} active, ${queuedRequests.length} queued)`);
    }
    
    return totalCancelled;
  }
  
  /**
   * Check if a request is active
   */
  public isActive(id: string): boolean {
    return this.requestHandler.isActive(id);
  }
  
  /**
   * Get the number of active requests
   */
  public getActiveCount(): number {
    return this.requestHandler.getActiveCount();
  }
  
  /**
   * Get all active request IDs
   */
  public getActiveRequestIds(): string[] {
    return this.requestHandler.getActiveRequestIds();
  }
  
  /**
   * Check if a request was cancelled
   */
  public isCancelled(id: string): boolean {
    return this.requestHandler.isCancelled(id);
  }
  
  /**
   * Get details about a specific request
   */
  public getRequestDetails(id: string) {
    return this.requestHandler.getRequestDetails(id);
  }
  
  /**
   * Get the current pool stats
   */
  public getStats(): PoolStats {
    const activeCounts = this.requestHandler.getActiveCounts();
    const limits = this.requestHandler.getLimits();
    
    // Create a properly typed perType object with all RequestType values initialized
    const typedPerType: Record<RequestType, number> = {
      [RequestType.GEMINI_CHAT]: limits.perType[RequestType.GEMINI_CHAT] || 0,
      [RequestType.CODE_ANALYSIS]: limits.perType[RequestType.CODE_ANALYSIS] || 0,
      [RequestType.GENERAL]: limits.perType[RequestType.GENERAL] || 0,
      [RequestType.FILE_OPERATION]: limits.perType[RequestType.FILE_OPERATION] || 0,
      [RequestType.CLAUDE_REQUEST]: limits.perType[RequestType.CLAUDE_REQUEST] || 0,
      [RequestType.WHISPER_REQUEST]: limits.perType[RequestType.WHISPER_REQUEST] || 0,
      [RequestType.VOICE_TRANSCRIPTION]: limits.perType[RequestType.VOICE_TRANSCRIPTION] || 0,
      [RequestType.PROCESSING]: limits.perType[RequestType.PROCESSING] || 0
    };
    
    return {
      queueSize: this.requestQueue.size(),
      activeRequests: this.requestHandler.getActiveCount(),
      activeTypes: activeCounts.types as Record<RequestType, number>,
      activeSessions: activeCounts.sessions,
      maxConcurrentLimits: {
        global: limits.global,
        perSession: limits.perSession,
        perType: typedPerType
      }
    };
  }
  
  /**
   * Update request limits
   */
  public updateLimits(
    newGlobalLimit?: number,
    newSessionLimit?: number,
    newTypeLimits?: Partial<Record<RequestType, number>>
  ): void {
    this.requestHandler.updateLimits(newGlobalLimit, newSessionLimit, newTypeLimits);
    console.log(`[Streaming Pool] Updated request limits:`, this.requestHandler.getLimits());
  }
}

// Create a singleton instance
const streamingRequestPool = new StreamingRequestPool();
export default streamingRequestPool;

// Re-export RequestType for external usage
export { RequestType } 
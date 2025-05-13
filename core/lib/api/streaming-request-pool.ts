import { 
  RequestType, 
  RequestInfo, 
  FetchOptions, 
  Response,
  PoolStats
} from './streaming-request-pool-types';
import { RequestHandler } from './streaming-request-pool/request-handler';
import { ActionState } from "@/types";

/**
 * Pool for managing concurrent streaming requests
 * 
 * This manages cancellable HTTP requests and tracks active requests
 * without redundant queueing (which is now handled by the job system)
 */
class StreamingRequestPool {
  private requestHandler: RequestHandler;
  
  constructor() {
    this.requestHandler = new RequestHandler();
  }
  
  // The execute method has been removed as part of the job queueing system refactoring.
  // All execute calls should be replaced with job creation and queueing.
  
  /**
   * Track a request without using fetch or execute
   */
  public trackRequest(id: string, sessionId: string, requestType: RequestType): void {
    this.requestHandler.trackRequest(id, sessionId, requestType);
  }
  
  /**
   * Untrack a request when it's complete
   */
  public untrackRequest(id: string): void {
    this.requestHandler.untrackRequest(id);
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
    return this.requestHandler.cancelAll(reason);
  }
  
  /**
   * Cancel all queued session requests
   */
  cancelQueuedSessionRequests(sessionId: string): number {
    return this.requestHandler.cancelSessionRequests(sessionId, `Session ${sessionId} requests cancelled`);
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
      queueSize: 0, // Queue now managed by job system
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
   * Get the request handler instance
   * This allows direct access to the handler for streaming job updates
   * 
   * @returns The RequestHandler instance
   */
  public getRequestHandler(): RequestHandler {
    return this.requestHandler;
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
    // Updated request limits
  }
}

// Create a singleton instance
const streamingRequestPool = new StreamingRequestPool();
export default streamingRequestPool;

// Re-export RequestType for external usage
export { RequestType } 

// Export RequestHandler for direct access in streaming implementations
// This allows external modules to access the handler methods for streaming job updates
export { RequestHandler } 
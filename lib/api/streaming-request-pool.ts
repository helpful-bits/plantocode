import { ActionState } from "@/types";
import { safeFetch } from "@/lib/utils";

// Type definitions for fetch
type RequestInfo = string | URL | Request;
type FetchOptions = RequestInit;
type Response = globalThis.Response;

// Type for the request function
type StreamingRequestFn<T> = () => Promise<ActionState<T>>;

// Define request types
export enum RequestType {
  GEMINI_CHAT = 'gemini_chat',      // Standard chat request
  CODE_ANALYSIS = 'code_analysis',   // Code analysis request
  GENERAL = 'general',               // Any other request
  FILE_OPERATION = 'file_operation', // Added file operation type with highest priority
  CLAUDE_REQUEST = 'claude_request',  // Requests to Claude API
  WHISPER_REQUEST = 'whisper_request' // Requests to Whisper API for transcription
}

// Type for queued requests
interface QueuedRequest<T> {
  requestFn: StreamingRequestFn<T>;
  resolve: (value: ActionState<T>) => void;
  reject: (reason: any) => void;
  sessionId: string;
  priority: number;
  startTime: number;
  requestType: RequestType;
  requestId?: string;  // Optional ID to track and cancel requests
}

/**
 * Pool for managing concurrent streaming requests
 * 
 * This manages concurrent streaming requests to various APIs
 * without blocking or dropping requests
 */
class StreamingRequestPool {
  private maxConcurrentGlobal: number = 10; // Global limit across all sessions
  private maxConcurrentPerSession: number = 5; // Limit per session

  // Track request type limits separately
  private maxConcurrentPerType: Record<RequestType, number> = {
    [RequestType.GEMINI_CHAT]: 3,
    [RequestType.CODE_ANALYSIS]: 2,  
    [RequestType.GENERAL]: 5,
    [RequestType.FILE_OPERATION]: 3,  // Allow 3 concurrent file operations
    [RequestType.CLAUDE_REQUEST]: 2,  // Limit Claude API requests
    [RequestType.WHISPER_REQUEST]: 2  // Limit Whisper API requests
  };
  
  private activeGlobal: number = 0;
  private activeSessions: Map<string, number> = new Map();
  private activeByType: Map<RequestType, number> = new Map();
  private queue: QueuedRequest<any>[] = [];
  
  // Track active requests with their abort controllers
  private activeRequests: Map<string, { 
    controller: AbortController, 
    cancelReason?: string,
    createdAt: number,
    sessionId: string,
    requestType: RequestType
  }> = new Map();
  
  constructor() {
    // Initialize active counts for each request type
    Object.values(RequestType).forEach(type => {
      this.activeByType.set(type, 0);
    });
  }
  
  /**
   * Execute a streaming request through the pool
   * @param requestFn Function that performs the actual request
   * @param sessionId Session ID for the request
   * @param priority Priority level (higher numbers = higher priority)
   * @param requestType Type of request (chat, analysis, etc.)
   * @param requestId Optional ID to track this request for cancellation
   * @returns The result of the request function
   */
  async execute<T>(
    requestFn: StreamingRequestFn<T>, 
    sessionId: string,
    priority: number = 1,
    requestType: RequestType = RequestType.GENERAL,
    requestId?: string
  ): Promise<ActionState<T>> {
    // Special handling for file operations - they should have high priority
    if (requestType === RequestType.FILE_OPERATION) {
      priority = 20; // Highest priority for file operations
    }
    
    // Check if we have capacity to run this request immediately
    if (this.hasCapacity(sessionId, requestType)) {
      return this.runRequest(requestFn, sessionId, requestType, requestId);
    } else {
      // No capacity, queue the request
      return new Promise<ActionState<T>>((resolve, reject) => {
        this.queue.push({
          requestFn,
          resolve,
          reject,
          sessionId,
          priority,
          startTime: Date.now(),
          requestType,
          requestId
        });
        
        // Sort the queue by priority and then by start time
        this.sortQueue();
        
        console.log(`[Streaming Pool] Queued ${requestType} request${requestId ? ` (${requestId})` : ''} for session ${sessionId}. Active global: ${this.activeGlobal}, queue size: ${this.queue.length}`);
      });
    }
  }
  
  /**
   * Check if there's capacity to run another request
   */
  private hasCapacity(sessionId: string, requestType: RequestType): boolean {
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
    const typeLimit = this.maxConcurrentPerType[requestType] || 1;
    if (typeActive >= typeLimit) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Run a request and update tracking counters
   */
  private async runRequest<T>(
    requestFn: StreamingRequestFn<T>,
    sessionId: string,
    requestType: RequestType,
    requestId?: string
  ): Promise<ActionState<T>> {
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
      
      // Process next queued request if any
      this.processQueue();
    }
  }
  
  /**
   * Sort the queue by priority and start time
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First sort by request type priority
      const typeA = a.requestType;
      const typeB = b.requestType;
      
      if (typeA !== typeB) {
        // FILE_OPERATION gets highest priority
        if (typeA === RequestType.FILE_OPERATION) return -1;
        if (typeB === RequestType.FILE_OPERATION) return 1;
        
        // CODE_ANALYSIS gets higher priority than GEMINI_CHAT for better UX
        if (typeA === RequestType.CODE_ANALYSIS) return -1;
        if (typeB === RequestType.CODE_ANALYSIS) return 1;
      }
      
      // Then sort by priority
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // Then by start time (earlier start time first)
      return a.startTime - b.startTime;
    });
  }
  
  /**
   * Process the next request in the queue if capacity allows
   */
  private processQueue(): void {
    if (this.queue.length === 0) return;
    
    // Find the first request in the queue that we have capacity for
    const index = this.queue.findIndex(request => 
      this.hasCapacity(request.sessionId, request.requestType)
    );
    
    if (index !== -1) {
      // Remove the request from the queue
      const request = this.queue.splice(index, 1)[0];
      
      // Run the request
      this.runRequest(request.requestFn, request.sessionId, request.requestType, request.requestId)
        .then(request.resolve)
        .catch(request.reject);
    }
  }
  
  /**
   * Get the current state of the pool
   */
  getStats() {
    return {
      activeGlobal: this.activeGlobal,
      queueLength: this.queue.length,
      activeSessions: Array.from(this.activeSessions.entries()).map(([sessionId, count]) => ({
        sessionId,
        activeCount: count
      })),
      activeByType: Array.from(this.activeByType.entries()).map(([type, count]) => ({
        type,
        activeCount: count
      })),
      activeRequests: Array.from(this.activeRequests.entries()).map(([id, info]) => ({
        id,
        sessionId: info.sessionId,
        requestType: info.requestType,
        createdAt: info.createdAt
      }))
    };
  }
  
  /**
   * Cancel all queued requests for a session
   * @param sessionId The session ID to cancel requests for
   * @returns The number of requests canceled
   */
  cancelQueuedSessionRequests(sessionId: string): number {
    // Find requests for this session
    const sessionRequests = this.queue.filter(request => request.sessionId === sessionId);
    
    // For each request, create a rejection
    for (const request of sessionRequests) {
      request.reject(new Error(`Request for session ${sessionId} was canceled`));
    }
    
    // Remove the requests from the queue
    this.queue = this.queue.filter(request => request.sessionId !== sessionId);
    
    // Also cancel active requests for this session
    let activeCanceled = 0;
    for (const [id, info] of this.activeRequests.entries()) {
      if (info.sessionId === sessionId) {
        if (this.cancelRequest(id, `Session ${sessionId} canceled all requests`)) {
          activeCanceled++;
        }
      }
    }
    
    console.log(`[Streaming Pool] Canceled ${sessionRequests.length} queued requests and ${activeCanceled} active requests for session ${sessionId}`);
    
    return sessionRequests.length + activeCanceled;
  }
  
  /**
   * Cancel all queued requests of a specific type, optionally filtered by session
   * @param requestType The request type to cancel
   * @param sessionId Optional session ID to filter by
   * @returns The number of requests canceled
   */
  cancelQueuedRequestsByType(requestType: RequestType, sessionId?: string): number {
    // Find requests of the specified type
    const matchingRequests = this.queue.filter(request => 
      request.requestType === requestType && 
      (!sessionId || request.sessionId === sessionId)
    );
    
    // For each request, create a rejection
    for (const request of matchingRequests) {
      request.reject(new Error(`Request of type ${requestType} was canceled`));
    }
    
    // Remove the requests from the queue
    this.queue = this.queue.filter(request => 
      !(request.requestType === requestType && 
        (!sessionId || request.sessionId === sessionId))
    );
    
    // Also cancel active requests of this type
    let activeCanceled = 0;
    for (const [id, info] of this.activeRequests.entries()) {
      if (info.requestType === requestType && (!sessionId || info.sessionId === sessionId)) {
        if (this.cancelRequest(id, `Request type ${requestType} canceled`)) {
          activeCanceled++;
        }
      }
    }
    
    console.log(`[Streaming Pool] Canceled ${matchingRequests.length} queued requests and ${activeCanceled} active requests of type ${requestType}${sessionId ? ` for session ${sessionId}` : ''}`);
    
    return matchingRequests.length + activeCanceled;
  }
  
  /**
   * Perform a fetch request with cancellation support
   * @param id Unique ID for this request for cancellation
   * @param url The URL to fetch
   * @param options Fetch options
   * @param sessionId Optional session ID to associate with this request
   * @param requestType Optional request type for tracking
   * @returns The fetch response
   */
  public async fetch(
    id: string, 
    url: RequestInfo, 
    options: FetchOptions = {},
    sessionId: string = 'unknown',
    requestType: RequestType = RequestType.GENERAL
  ): Promise<Response> {
    // Create abort controller for this request
    const controller = new AbortController();
    
    // Store it in our map
    this.activeRequests.set(id, { 
      controller, 
      createdAt: Date.now(),
      sessionId,
      requestType
    });
    
    try {
      // Add the signal to the fetch options
      const fetchOptions = {
        ...options,
        signal: controller.signal
      };

      // Make the request using safeFetch
      return await safeFetch(url, fetchOptions);
    } catch (error) {
      // If request was canceled by us, provide a clearer error
      if (this.activeRequests.has(id) && this.activeRequests.get(id)!.cancelReason) {
        const cancelReason = this.activeRequests.get(id)!.cancelReason;
        throw new Error(cancelReason);
      }
      
      // Otherwise re-throw the original error
      throw error;
    } finally {
      // Clean up the controller when done
      this.activeRequests.delete(id);
    }
  }
  
  /**
   * Cancel a specific request by ID
   * @param id The request ID to cancel
   * @param reason Optional reason for cancellation
   * @returns true if the request was found and canceled, false otherwise
   */
  public cancelRequest(id: string, reason = 'User canceled'): boolean {
    const request = this.activeRequests.get(id);
    
    if (request) {
      console.log(`[Streaming Pool] Canceling request ${id}: ${reason}`);
      request.cancelReason = reason;
      request.controller.abort(reason);
      return true;
    }
    
    // Also check the queue for this request ID
    const queueIndex = this.queue.findIndex(req => req.requestId === id);
    if (queueIndex >= 0) {
      console.log(`[Streaming Pool] Canceling queued request ${id}: ${reason}`);
      this.queue[queueIndex].reject(new Error(reason));
      this.queue.splice(queueIndex, 1);
      return true;
    }
    
    return false;
  }
  
  /**
   * Cancel all active requests
   * @param reason Optional reason for cancellation
   * @returns The number of requests canceled
   */
  public cancelAll(reason = 'All requests canceled'): number {
    const count = this.activeRequests.size;
    
    console.log(`[Streaming Pool] Canceling all ${count} active requests: ${reason}`);
    
    // Cancel all active requests
    for (const [id, request] of this.activeRequests.entries()) {
      request.cancelReason = reason;
      request.controller.abort(reason);
    }
    
    // Also reject all queued requests
    const queueCount = this.queue.length;
    for (const request of this.queue) {
      request.reject(new Error(reason));
    }
    
    // Clear the queue
    this.queue = [];
    
    return count + queueCount;
  }
  
  /**
   * Check if a request is active
   * @param id The request ID to check
   * @returns true if the request is active, false otherwise
   */
  public isActive(id: string): boolean {
    return this.activeRequests.has(id);
  }
  
  /**
   * Get the number of active requests
   * @returns The number of active requests
   */
  public getActiveCount(): number {
    return this.activeRequests.size;
  }
  
  /**
   * Get the IDs of all active requests
   * @returns Array of active request IDs
   */
  public getActiveRequestIds(): string[] {
    return Array.from(this.activeRequests.keys());
  }
  
  /**
   * Get the details of an active request
   * @param id The request ID to look up
   * @returns The request details, or null if not found
   */
  public getRequestDetails(id: string) {
    const request = this.activeRequests.get(id);
    if (!request) return null;
    
    return {
      id,
      sessionId: request.sessionId,
      requestType: request.requestType,
      createdAt: request.createdAt,
      ageMs: Date.now() - request.createdAt
    };
  }
}

const streamingRequestPool = new StreamingRequestPool();
export default streamingRequestPool; 
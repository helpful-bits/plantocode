import { ActionState } from "@/types";

// Type for the request function
type StreamingRequestFn<T> = () => Promise<ActionState<T>>;

// Define request types
export enum RequestType {
  GEMINI_CHAT = 'gemini_chat',      // Standard chat request
  CODE_ANALYSIS = 'code_analysis',   // Code analysis request
  GENERAL = 'general'                // Any other request
}

// Type for queued requests
interface QueuedRequest<T> {
  requestFn: StreamingRequestFn<T>;
  resolve: (value: ActionState<T>) => void;
  reject: (reason: any) => void;
  sessionId: string;
  priority: number;
  startTime: number;
  requestType: RequestType; // Add request type
}

/**
 * Pool for managing concurrent streaming requests
 * 
 * This manages concurrent streaming requests to the Gemini API
 * without blocking or dropping requests
 */
class StreamingRequestPool {
  private maxConcurrentGlobal: number = 10; // Global limit across all sessions
  private maxConcurrentPerSession: number = 5; // Limit per session

  // Track request type limits separately
  private maxConcurrentPerType: Record<RequestType, number> = {
    [RequestType.GEMINI_CHAT]: 3,
    [RequestType.CODE_ANALYSIS]: 2,  
    [RequestType.GENERAL]: 5
  };
  
  private activeGlobal: number = 0;
  private activeSessions: Map<string, number> = new Map();
  private activeByType: Map<RequestType, number> = new Map();
  private queue: QueuedRequest<any>[] = [];
  
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
   * @returns The result of the request function
   */
  async execute<T>(
    requestFn: StreamingRequestFn<T>, 
    sessionId: string,
    priority: number = 1,
    requestType: RequestType = RequestType.GENERAL
  ): Promise<ActionState<T>> {
    // Check if we have capacity to run this request immediately
    if (this.hasCapacity(sessionId, requestType)) {
      return this.runRequest(requestFn, sessionId, requestType);
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
          requestType
        });
        
        // Sort the queue by priority and then by start time
        this.sortQueue();
        
        console.log(`[Streaming Pool] Queued ${requestType} request for session ${sessionId}. Active global: ${this.activeGlobal}, queue size: ${this.queue.length}`);
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
    requestType: RequestType
  ): Promise<ActionState<T>> {
    // Increment counters
    this.activeGlobal++;
    
    // Increment session counter
    const sessionActive = this.activeSessions.get(sessionId) || 0;
    this.activeSessions.set(sessionId, sessionActive + 1);
    
    // Increment request type counter
    const typeActive = this.activeByType.get(requestType) || 0;
    this.activeByType.set(requestType, typeActive + 1);
    
    console.log(`[Streaming Pool] Running ${requestType} request for session ${sessionId}. Active global: ${this.activeGlobal}, session active: ${sessionActive + 1}, type active: ${typeActive + 1}`);
    
    try {
      // Execute the actual request
      return await requestFn();
    } finally {
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
      // First sort by request type priority (code analysis > chat > general)
      const typeA = a.requestType;
      const typeB = b.requestType;
      
      if (typeA !== typeB) {
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
      this.runRequest(request.requestFn, request.sessionId, request.requestType)
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
    
    // Remove them from the queue
    this.queue = this.queue.filter(request => request.sessionId !== sessionId);
    
    // Resolve the promises with cancellation
    sessionRequests.forEach(request => {
      request.resolve({
        isSuccess: false,
        message: "Request was canceled while queued.",
        data: null
      });
    });
    
    console.log(`[Streaming Pool] Canceled ${sessionRequests.length} queued requests for session ${sessionId}`);
    return sessionRequests.length;
  }
  
  /**
   * Cancel all queued requests of a specific type
   * @param requestType The type of requests to cancel
   * @param sessionId Optional session ID to limit cancellation to
   * @returns The number of requests canceled
   */
  cancelQueuedRequestsByType(requestType: RequestType, sessionId?: string): number {
    // Find matching requests
    const matchingRequests = this.queue.filter(request => 
      request.requestType === requestType && 
      (sessionId === undefined || request.sessionId === sessionId)
    );
    
    // Remove them from the queue
    this.queue = this.queue.filter(request => 
      !(request.requestType === requestType && 
        (sessionId === undefined || request.sessionId === sessionId))
    );
    
    // Resolve the promises with cancellation
    matchingRequests.forEach(request => {
      request.resolve({
        isSuccess: false,
        message: `Request was canceled: conflicting ${requestType} request`,
        data: null
      });
    });
    
    const logMessage = sessionId ?
      `[Streaming Pool] Canceled ${matchingRequests.length} queued ${requestType} requests for session ${sessionId}` :
      `[Streaming Pool] Canceled ${matchingRequests.length} queued ${requestType} requests`; // Simplified log
    
    console.log(logMessage);
    return matchingRequests.length;
  }
}

// Export singleton instance
const streamingRequestPool = new StreamingRequestPool();
export default streamingRequestPool; 
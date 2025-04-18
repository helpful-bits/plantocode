import { ActionState } from "@/types";

// Type for the request function
type StreamingRequestFn<T> = () => Promise<ActionState<T>>;

// Type for queued requests
interface QueuedRequest<T> {
  requestFn: StreamingRequestFn<T>;
  resolve: (value: ActionState<T>) => void;
  reject: (reason: any) => void;
  sessionId: string;
  priority: number;
  startTime: number;
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
  
  private activeGlobal: number = 0;
  private activeSessions: Map<string, number> = new Map();
  private queue: QueuedRequest<any>[] = [];
  
  /**
   * Execute a streaming request through the pool
   * @param requestFn Function that performs the actual request
   * @param sessionId Session ID for the request
   * @param priority Priority level (higher numbers = higher priority)
   * @returns The result of the request function
   */
  async execute<T>(
    requestFn: StreamingRequestFn<T>, 
    sessionId: string,
    priority: number = 1
  ): Promise<ActionState<T>> {
    // Check if we have capacity to run this request immediately
    if (this.hasCapacity(sessionId)) {
      return this.runRequest(requestFn, sessionId);
    } else {
      // No capacity, queue the request
      return new Promise<ActionState<T>>((resolve, reject) => {
        this.queue.push({
          requestFn,
          resolve,
          reject,
          sessionId,
          priority,
          startTime: Date.now()
        });
        
        // Sort the queue by priority and then by start time
        this.sortQueue();
        
        console.log(`[Streaming Pool] Queued request for session ${sessionId}. Active global: ${this.activeGlobal}, queue size: ${this.queue.length}`);
      });
    }
  }
  
  /**
   * Check if there's capacity to run another request
   */
  private hasCapacity(sessionId: string): boolean {
    // Check global capacity
    if (this.activeGlobal >= this.maxConcurrentGlobal) {
      return false;
    }
    
    // Check per-session capacity
    const sessionActive = this.activeSessions.get(sessionId) || 0;
    return sessionActive < this.maxConcurrentPerSession;
  }
  
  /**
   * Run a request and update tracking counters
   */
  private async runRequest<T>(
    requestFn: StreamingRequestFn<T>,
    sessionId: string
  ): Promise<ActionState<T>> {
    // Increment counters
    this.activeGlobal++;
    const sessionActive = this.activeSessions.get(sessionId) || 0;
    this.activeSessions.set(sessionId, sessionActive + 1);
    
    console.log(`[Streaming Pool] Running request for session ${sessionId}. Active global: ${this.activeGlobal}, session active: ${sessionActive + 1}`);
    
    try {
      // Execute the actual request
      return await requestFn();
    } finally {
      // Decrement counters when request completes (regardless of success/failure)
      this.activeGlobal--;
      const currentSessionActive = this.activeSessions.get(sessionId) || 1;
      this.activeSessions.set(sessionId, currentSessionActive - 1);
      
      // Process next queued request if any
      this.processQueue();
    }
  }
  
  /**
   * Sort the queue by priority and start time
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Sort by priority first (higher priority first)
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
      this.hasCapacity(request.sessionId)
    );
    
    if (index !== -1) {
      // Remove the request from the queue
      const request = this.queue.splice(index, 1)[0];
      
      // Run the request
      this.runRequest(request.requestFn, request.sessionId)
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
}

// Export singleton instance
const streamingRequestPool = new StreamingRequestPool();
export default streamingRequestPool; 
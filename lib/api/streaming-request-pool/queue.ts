import { RequestType } from '../streaming-request-pool-types';

// Type for queued requests
export interface QueuedRequest<T> {
  requestFn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
  sessionId: string;
  priority: number;
  startTime: number;
  requestType: RequestType;
  requestId?: string;  // Optional ID to track and cancel requests
}

/**
 * Queue management for streaming requests
 */
export class RequestQueue {
  private queue: QueuedRequest<any>[] = [];
  
  /**
   * Add a request to the queue
   */
  public enqueue<T>(request: QueuedRequest<T>): void {
    this.queue.push(request);
    this.sortQueue();
  }
  
  /**
   * Sort the queue by priority and start time
   */
  public sortQueue(): void {
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
   * Get and remove the next request that meets the capacity criteria
   */
  public dequeue(
    hasCapacityFn: (sessionId: string, requestType: RequestType) => boolean
  ): QueuedRequest<any> | null {
    // Find the first request in the queue that we have capacity for
    const index = this.queue.findIndex(request => 
      hasCapacityFn(request.sessionId, request.requestType)
    );
    
    if (index !== -1) {
      // Remove the request from the queue
      return this.queue.splice(index, 1)[0];
    }
    
    return null;
  }
  
  /**
   * Get the size of the queue
   */
  public size(): number {
    return this.queue.length;
  }
  
  /**
   * Get all queued requests for a specific session
   */
  public getSessionRequests(sessionId: string): QueuedRequest<any>[] {
    return this.queue.filter(request => request.sessionId === sessionId);
  }
  
  /**
   * Get all queued requests by ID
   */
  public getRequestById(requestId: string): QueuedRequest<any> | undefined {
    return this.queue.find(request => request.requestId === requestId);
  }
  
  /**
   * Get all queued requests by type
   */
  public getRequestsByType(requestType: RequestType): QueuedRequest<any>[] {
    return this.queue.filter(request => request.requestType === requestType);
  }
  
  /**
   * Remove a request by its ID
   */
  public remove(requestId: string): boolean {
    const index = this.queue.findIndex(request => request.requestId === requestId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Remove all requests for a session
   */
  public removeSessionRequests(sessionId: string): QueuedRequest<any>[] {
    const removedRequests: QueuedRequest<any>[] = [];
    let i = 0;
    
    while (i < this.queue.length) {
      if (this.queue[i].sessionId === sessionId) {
        removedRequests.push(this.queue.splice(i, 1)[0]);
      } else {
        i++;
      }
    }
    
    return removedRequests;
  }
  
  /**
   * Remove all requests of a specific type
   */
  public removeRequestsByType(requestType: RequestType, sessionId?: string): QueuedRequest<any>[] {
    const removedRequests: QueuedRequest<any>[] = [];
    let i = 0;
    
    while (i < this.queue.length) {
      if (
        this.queue[i].requestType === requestType && 
        (sessionId === undefined || this.queue[i].sessionId === sessionId)
      ) {
        removedRequests.push(this.queue.splice(i, 1)[0]);
      } else {
        i++;
      }
    }
    
    return removedRequests;
  }
  
  /**
   * Clear the entire queue
   */
  public clear(): QueuedRequest<any>[] {
    const oldQueue = [...this.queue];
    this.queue = [];
    return oldQueue;
  }
} 
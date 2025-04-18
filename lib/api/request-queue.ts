import crypto from 'crypto';

// Types for the request queue
export interface QueuedRequest<T> {
  id: string;
  priority: number;
  createdAt: number;
  execute: () => Promise<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  retryCount: number;
  maxRetries: number;
  backoffMs: number;
  tags: string[];
}

export interface QueueStats {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  avgWaitTimeMs: number;
  avgProcessTimeMs: number;
}

// Provider rate limit definitions
export interface RateLimitConfig {
  requestsPerMinute: number;
  maxConcurrent: number;
  backoffMs: number;
  maxRetries: number;
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  'gemini': {
    requestsPerMinute: 10000,
    maxConcurrent: 1000,
    backoffMs: 1000,
    maxRetries: 3
  },
  'claude': {
    requestsPerMinute: 10000,
    maxConcurrent: 1000,
    backoffMs: 2000,
    maxRetries: 3
  },
  'default': {
    requestsPerMinute: 1000,
    maxConcurrent: 100,
    backoffMs: 1000,
    maxRetries: 2
  }
};

class RequestQueue {
  private queue: QueuedRequest<any>[] = [];
  private active: Map<string, QueuedRequest<any>> = new Map();
  private completed: number = 0;
  private failed: number = 0;
  private waitTimes: number[] = [];
  private processTimes: number[] = [];
  private rateLimits: Record<string, RateLimitConfig>;
  private rateLimitTracking: Record<string, { requestTimes: number[], activeCount: number }> = {};
  private isProcessing: boolean = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  
  constructor(rateLimits?: Record<string, RateLimitConfig>) {
    this.rateLimits = rateLimits || DEFAULT_RATE_LIMITS;
    
    // Initialize rate limit tracking
    Object.keys(this.rateLimits).forEach(provider => {
      this.rateLimitTracking[provider] = {
        requestTimes: [],
        activeCount: 0
      };
    });
    
    // Start processing loop
    this.processQueue();
  }
  
  // Add a request to the queue
  enqueue<T>(
    execute: () => Promise<T>,
    options: {
      provider: string;
      priority?: number;
      onSuccess?: (result: T) => void;
      onError?: (error: Error) => void;
      maxRetries?: number;
      tags?: string[];
    }
  ): string {
    const id = crypto.randomUUID();
    const provider = options.provider || 'default';
    const rateLimitConfig = this.rateLimits[provider] || this.rateLimits.default;
    
    const request: QueuedRequest<T> = {
      id,
      priority: options.priority || 0,
      createdAt: Date.now(),
      execute,
      onSuccess: options.onSuccess,
      onError: options.onError,
      retryCount: 0,
      maxRetries: options.maxRetries !== undefined ? options.maxRetries : rateLimitConfig.maxRetries,
      backoffMs: rateLimitConfig.backoffMs,
      tags: [...(options.tags || []), provider]
    };
    
    this.queue.push(request);
    
    // Sort queue by priority (higher numbers first) and creation time
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.createdAt - b.createdAt;
    });
    
    // Trigger queue processing with debounce
    this.scheduleProcessing();
    
    return id;
  }
  
  // Cancel a request by id
  cancel(id: string): boolean {
    // Check if the request is in the queue
    const queueIndex = this.queue.findIndex(req => req.id === id);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
      return true;
    }
    
    // Check if the request is active
    if (this.active.has(id)) {
      // We can't truly cancel an active request, but we can mark it as 
      // cancelled so that we don't process success/error callbacks
      const request = this.active.get(id)!;
      request.onSuccess = undefined;
      request.onError = undefined;
      return true;
    }
    
    return false;
  }
  
  // Get current queue stats
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      active: this.active.size,
      completed: this.completed,
      failed: this.failed,
      avgWaitTimeMs: this.calculateAverage(this.waitTimes),
      avgProcessTimeMs: this.calculateAverage(this.processTimes)
    };
  }
  
  // Check if we can process more requests for a provider
  private canProcessForProvider(provider: string): boolean {
    const limits = this.rateLimits[provider] || this.rateLimits.default;
    const tracking = this.rateLimitTracking[provider] || { requestTimes: [], activeCount: 0 };
    
    // Check concurrent limit
    if (tracking.activeCount >= limits.maxConcurrent) {
      return false;
    }
    
    // Check rate limit (requests per minute)
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean up old request times
    tracking.requestTimes = tracking.requestTimes.filter(time => time > oneMinuteAgo);
    
    // Check if we're under the rate limit
    return tracking.requestTimes.length < limits.requestsPerMinute;
  }
  
  // Record a request being made for rate limiting
  private recordRequest(provider: string) {
    const tracking = this.rateLimitTracking[provider] || { requestTimes: [], activeCount: 0 };
    tracking.requestTimes.push(Date.now());
    tracking.activeCount++;
    this.rateLimitTracking[provider] = tracking;
  }
  
  // Record a request completing for rate limiting
  private recordRequestComplete(provider: string) {
    const tracking = this.rateLimitTracking[provider] || { requestTimes: [], activeCount: 0 };
    tracking.activeCount = Math.max(0, tracking.activeCount - 1);
    this.rateLimitTracking[provider] = tracking;
  }
  
  // Process the next item in the queue that can be processed
  private async processNext() {
    if (this.queue.length === 0) return;
    
    // Group requests by provider
    const byProvider: Record<string, QueuedRequest<any>[]> = {};
    
    for (const request of this.queue) {
      // Find the provider tag
      const providerTag = request.tags.find(tag => this.rateLimits[tag]) || 'default';
      byProvider[providerTag] = byProvider[providerTag] || [];
      byProvider[providerTag].push(request);
    }
    
    // Try to process one request from each provider
    for (const [provider, requests] of Object.entries(byProvider)) {
      if (requests.length > 0 && this.canProcessForProvider(provider)) {
        const request = requests[0];
        const index = this.queue.findIndex(r => r.id === request.id);
        
        if (index >= 0) {
          // Remove from queue and add to active
          this.queue.splice(index, 1);
          this.active.set(request.id, request);
          
          // Record for rate limiting
          this.recordRequest(provider);
          
          // Calculate wait time
          const waitTime = Date.now() - request.createdAt;
          this.waitTimes.push(waitTime);
          
          // Keep the wait times array from growing too large
          if (this.waitTimes.length > 100) {
            this.waitTimes = this.waitTimes.slice(-100);
          }
          
          // Process the request asynchronously
          const startTime = Date.now();
          
          try {
            const result = await request.execute();
            
            // Calculate process time
            const processTime = Date.now() - startTime;
            this.processTimes.push(processTime);
            
            // Keep the process times array from growing too large
            if (this.processTimes.length > 100) {
              this.processTimes = this.processTimes.slice(-100);
            }
            
            // Call success callback if it exists
            if (request.onSuccess) {
              try {
                request.onSuccess(result);
              } catch (callbackError) {
                console.error('Error in success callback:', callbackError);
              }
            }
            
            this.completed++;
          } catch (error) {
            // Handle retry logic
            if (request.retryCount < request.maxRetries) {
              request.retryCount++;
              
              // Calculate backoff with exponential increase
              const backoff = request.backoffMs * Math.pow(2, request.retryCount - 1);
              
              // Re-add to queue after backoff delay
              setTimeout(() => {
                // Reinstate with same ID and incremented retry count
                this.queue.push(request);
                this.scheduleProcessing();
              }, backoff);
            } else {
              // Max retries reached, call error callback
              if (request.onError) {
                try {
                  request.onError(error instanceof Error ? error : new Error(String(error)));
                } catch (callbackError) {
                  console.error('Error in error callback:', callbackError);
                }
              }
              
              this.failed++;
            }
          } finally {
            // Remove from active requests
            this.active.delete(request.id);
            
            // Update rate limit tracking
            this.recordRequestComplete(provider);
            
            // Continue processing queue
            this.scheduleProcessing();
          }
          
          // We processed one request for this provider, move to next provider
          break;
        }
      }
    }
  }
  
  // Process items in the queue
  private async processQueue() {
    if (this.isProcessing) return;
    
    try {
      this.isProcessing = true;
      
      // Process all requests that can be processed
      while (this.queue.length > 0) {
        // Check if any request can be processed
        const providers = [...new Set(this.queue.map(req => {
          return req.tags.find(tag => this.rateLimits[tag]) || 'default';
        }))];
        
        const canProcess = providers.some(provider => this.canProcessForProvider(provider));
        
        if (!canProcess) break;
        
        // Process the next request
        await this.processNext();
      }
    } finally {
      this.isProcessing = false;
      
      // Check if we need to continue processing
      if (this.queue.length > 0) {
        // Schedule next run after a short delay
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }
  
  // Schedule queue processing with debounce
  private scheduleProcessing() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.processQueue();
    }, 0);
  }
  
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return Math.round(sum / values.length);
  }
}

// Export singleton instance
const requestQueue = new RequestQueue();
export default requestQueue; 
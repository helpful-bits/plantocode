import { v4 as uuid } from 'uuid';
import { QueuedJob, JobType, BaseJobPayload, AnyJobPayload } from './job-types';

/**
 * Global job queue for managing background jobs.
 * This is an in-memory implementation that could be replaced with
 * a persistent queue like BullMQ with Redis in a production environment.
 */
export class GlobalJobQueue {
  private queue: QueuedJob[] = [];
  private stats: { 
    total: number; 
    byPriority: Record<number, number>;
    byType: Partial<Record<JobType, number>>;
    retries: number;
  } = {
    total: 0,
    byPriority: {},
    byType: {},
    retries: 0
  };
  
  private static readonly MAX_ATTEMPTS = 3; // Maximum retry attempts

  /**
   * Add a job to the queue
   * 
   * @param job Job data to enqueue (without id and createdAt)
   * @returns The assigned queue job ID
   */
  async enqueue(job: Omit<QueuedJob, 'id' | 'createdAt' | 'attempt'>): Promise<string> {
    const id = `queue_${uuid()}`;
    const createdAt = Date.now();
    
    const queuedJob: QueuedJob = {
      ...job,
      id,
      createdAt,
      attempt: 1 // First attempt
    };
    
    this.queue.push(queuedJob);
    this.updateStats();
    
    // Sort the queue by priority (higher priority first) and then by creation time (oldest first)
    this.sortQueue();
    
    console.debug(`[GlobalJobQueue] Enqueued job ${id} of type ${job.type} with priority ${job.priority}`);
    
    return id;
  }
  
  /**
   * Re-enqueue a job for retry
   * 
   * @param job The job to re-enqueue
   * @returns The new queue job ID or null if max attempts reached
   */
  async reEnqueue(job: QueuedJob): Promise<string | null> {
    if (job.attempt >= GlobalJobQueue.MAX_ATTEMPTS) {
      console.warn(`[GlobalJobQueue] Job ${job.id} (type: ${job.type}) reached max attempts (${job.attempt}). Not re-enqueueing.`);
      return null;
    }

    const newAttempt = job.attempt + 1;
    console.log(`[GlobalJobQueue] Re-enqueueing job ${job.id} (type: ${job.type}), attempt ${newAttempt}.`);
    
    // Adjust priority slightly lower for retries to avoid hogging resources
    const priorityAdjustment = Math.max(1, job.priority - 1);
    
    const reEnqueuedJob: QueuedJob = {
      ...job,
      id: `queue_${uuid()}`, // Generate new ID
      createdAt: Date.now(), // Reset creation time
      attempt: newAttempt,
      priority: priorityAdjustment
    };

    this.queue.push(reEnqueuedJob);
    this.sortQueue();
    this.stats.retries++;
    this.updateStats();
    
    console.log(`[GlobalJobQueue] Re-enqueued job ${reEnqueuedJob.id} as attempt ${newAttempt}. Queue size: ${this.queue.length}`);
    return reEnqueuedJob.id;
  }
  
  /**
   * Get and remove the highest priority job from the queue
   * 
   * @returns The highest priority job or null if the queue is empty
   */
  async dequeue(): Promise<QueuedJob | null> {
    if (this.queue.length === 0) {
      return null;
    }
    
    // Get the highest priority job (queue is already sorted)
    const job = this.queue.shift();
    
    if (job) {
      this.updateStats();
      console.debug(`[GlobalJobQueue] Dequeued job ${job.id} of type ${job.type} (attempt: ${job.attempt})`);
    }
    
    return job || null;
  }
  
  /**
   * Get the highest priority job without removing it from the queue
   * 
   * @returns The highest priority job or null if the queue is empty
   */
  async peek(): Promise<QueuedJob | null> {
    if (this.queue.length === 0) {
      return null;
    }
    
    return this.queue[0];
  }
  
  /**
   * Remove a specific job from the queue by its ID
   * 
   * @param queueJobId The ID of the job to remove
   * @returns true if the job was found and removed, false otherwise
   */
  async remove(queueJobId: string): Promise<boolean> {
    const initialLength = this.queue.length;
    
    this.queue = this.queue.filter(job => job.id !== queueJobId);
    
    const removed = initialLength > this.queue.length;
    
    if (removed) {
      this.updateStats();
      console.debug(`[GlobalJobQueue] Removed job ${queueJobId} from queue`);
    }
    
    return removed;
  }
  
  /**
   * Remove all jobs for a specific session
   * 
   * @param sessionId The session ID to remove jobs for
   * @returns The number of jobs removed
   */
  async removeBySessionId(sessionId: string): Promise<number> {
    const initialLength = this.queue.length;
    
    this.queue = this.queue.filter(job => job.payload.sessionId !== sessionId);
    
    const removed = initialLength - this.queue.length;
    
    if (removed > 0) {
      this.updateStats();
      console.debug(`[GlobalJobQueue] Removed ${removed} jobs for session ${sessionId}`);
    }
    
    return removed;
  }
  
  /**
   * Remove a job by its background job ID
   * 
   * @param backgroundJobId The background job ID to remove
   * @returns true if a job was found and removed, false otherwise
   */
  async removeByBackgroundJobId(backgroundJobId: string): Promise<boolean> {
    const initialLength = this.queue.length;
    
    this.queue = this.queue.filter(job => job.payload.backgroundJobId !== backgroundJobId);
    
    const removed = initialLength > this.queue.length;
    
    if (removed) {
      this.updateStats();
      console.debug(`[GlobalJobQueue] Removed job(s) with backgroundJobId ${backgroundJobId}`);
    }
    
    return removed;
  }
  
  /**
   * Get the number of jobs in the queue
   * 
   * @returns The number of jobs in the queue
   */
  size(): number {
    return this.queue.length;
  }
  
  /**
   * Get statistics about the queue
   * 
   * @returns Queue statistics
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Clear all jobs from the queue
   */
  clear(): void {
    this.queue = [];
    this.stats = { total: 0, byPriority: {}, byType: {}, retries: 0 };
    console.log('[GlobalJobQueue] Cleared all jobs from the queue');
  }
  
  /**
   * Sort the queue by priority and creation time
   * Higher priority jobs come first, and for jobs with the same priority,
   * the oldest jobs come first (FIFO within priority).
   */
  private sortQueue() {
    this.queue.sort((a, b) => {
      // First sort by priority (descending)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      
      // Then sort by creation time (ascending) for equal priorities
      return a.createdAt - b.createdAt;
    });
  }
  
  /**
   * Update queue statistics
   */
  private updateStats() {
    // Reset stats
    this.stats.total = this.queue.length;
    this.stats.byPriority = {};
    this.stats.byType = {};
    
    // Count jobs by priority and type
    for (const job of this.queue) {
      this.stats.byPriority[job.priority] = (this.stats.byPriority[job.priority] || 0) + 1;
      this.stats.byType[job.type] = (this.stats.byType[job.type] || 0) + 1;
    }
  }
}

// Export a singleton instance
export const globalJobQueue = new GlobalJobQueue();